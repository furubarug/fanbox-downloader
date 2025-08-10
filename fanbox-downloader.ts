import { DownloadHelper, DownloadObject, DownloadUtils } from 'download-helper/download-helper';

/**
 * ダウンローダーの管理クラス
 */
class DownloadManage {
	/** ダウンロード用ユーティリティ 何かあれば適当にオーバライドする */
	public static readonly utils = new DownloadUtils();

	/** 投稿情報の出力をJSONにする（基本true, txtにする場合はfalseに変える）*/
	public static readonly isExportJson = true;

	public readonly downloadObject: DownloadObject;

	public isIgnoreFree = false;

	private fees: number[] = [];

	private tags: string[] = [];

	private isLimitAvailable = false;

	private limit = 0;

	constructor(public readonly userId: string, public readonly feeMap: Map<number, string>) {
		this.downloadObject = new DownloadObject(userId, DownloadManage.utils);
	}

	addFee(fee: number) {
		this.fees = [...new Set([...this.fees, fee])];
	}

	addTags(...tags: string[]) {
		this.tags = [...new Set([...this.tags, ...tags])];
	}

	applyTags() {
		const fees = this.fees.sort((a, b) => a - b).map((fee) => this.getTagByFee(fee));
		const tags = this.tags.filter((tag) => !fees.includes(tag));
		this.downloadObject.setTags([...fees, ...tags]);
	}

	getTagByFee(fee: number): string {
		return this.feeMap.get(fee) ?? (fee > 0 ? `${fee}円` : '無料') + 'プラン';
	}

	setLimitAvailable(isLimitAvailable: boolean) {
		this.isLimitAvailable = isLimitAvailable;
	}

	isLimitValid(): boolean {
		if (!this.isLimitAvailable) return true;
		return this.limit > 0;
	}

	decrementLimit() {
		if (this.isLimitAvailable) {
			this.limit--;
		}
	}

	setLimit(limit: number) {
		if (this.isLimitAvailable) {
			this.limit = limit;
		}
	}
}

/**
 * メイン
 */
export async function main() {
	let downloadObject: DownloadObject | undefined;
	if (window.location.origin === 'https://downloads.fanbox.cc') {
		await new DownloadHelper(DownloadManage.utils).createDownloadUI('fanbox-downloader');
		return;
	} else if (window.location.origin === 'https://www.fanbox.cc') {
		const creatorId = window.location.href.match(/fanbox.cc\/@([^\/]*)/)?.[1];
		const postId = window.location.href.match(/fanbox.cc\/@.*\/posts\/(\d*)/)?.[1];
		downloadObject = await searchBy(creatorId, postId);
	} else if (window.location.href.match(/^https:\/\/(.*)\.fanbox\.cc\//)) {
		const creatorId = window.location.href.match(/^https:\/\/(.*)\.fanbox\.cc\//)?.[1];
		const postId = window.location.href.match(/.*\.fanbox\.cc\/posts\/(\d*)/)?.[1];
		downloadObject = await searchBy(creatorId, postId);
	} else {
		alert(`ここどこですか(${window.location.href})`);
		return;
	}
	if (!downloadObject) return;
	const json = downloadObject.stringify();
	console.log(json);
	const jsonCopied = () => {
		alert('jsonをコピーしました。downloads.fanbox.ccで実行して貼り付けてね');
		if (confirm('downloads.fanbox.ccに遷移する？')) {
			document.location.href = 'https://downloads.fanbox.cc';
		}
	};
	try {
		await navigator.clipboard.writeText(json);
		jsonCopied();
	} catch (_) {
		document.body.addEventListener(
			'click',
			() => {
				navigator.clipboard
					.writeText(json)
					.then(() => jsonCopied())
					.catch(() =>
						alert('jsonコピーに失敗しました。もう一度実行するかコンソールからコピーしてね'),
					);
			},
			{ once: true },
		);
		alert('jsonコピーに失敗しました。画面の適当なとこをクリック！');
	}
}

/**
 * 投稿情報を取得してまとめて返す
 * @param creatorId ユーザーID
 * @param postId 投稿ID
 */
async function searchBy(
	creatorId: string | undefined,
	postId: string | undefined,
): Promise<DownloadObject | undefined> {
	if (!creatorId) {
		alert('しらないURL');
		return;
	}
	const plans = DownloadManage.utils.httpGetAs<Plans>(
		`https://api.fanbox.cc/plan.listCreator?creatorId=${creatorId}`,
	).body;
	const feeMapper = new Map<number, string>();
	plans?.forEach((plan) => feeMapper.set(plan.fee, plan.title));
	const downloadSettings = new DownloadManage(creatorId, feeMapper);
	downloadSettings.downloadObject.setUrl(`https://www.fanbox.cc/@${creatorId}`);
	const definedTags =
		DownloadManage.utils
			.httpGetAs<Tags>(`https://api.fanbox.cc/tag.getFeatured?creatorId=${creatorId}`)
			.body?.map((tag) => tag.tag) ?? [];
	downloadSettings.addTags(...definedTags);
	if (postId) addByPostInfo(downloadSettings, getPostInfoById(postId));
	else await getItemsById(downloadSettings);
	downloadSettings.applyTags();
	return downloadSettings.downloadObject;
}

/**
 * ユーザーIDからitemsを得る
 * @param downloadManage ダウンロード設定
 */
async function getItemsById(downloadManage: DownloadManage) {
	downloadManage.isIgnoreFree = confirm('無料コンテンツを省く？');
	const limitBase = prompt('取得制限数を入力 キャンセルで全て取得');
	if (limitBase) {
		const limit = Number.parseInt(limitBase);
		if (limit) {
			downloadManage.setLimitAvailable(true);
			downloadManage.setLimit(limit);
		}
	}
	const urls = DownloadManage.utils.httpGetAs<{ body: string[] }>(
		`https://api.fanbox.cc/post.paginateCreator?creatorId=${downloadManage.userId}`,
	).body;
	for (let i = 0; i < urls.length; i++) {
		console.log(`${i + 1}回目`);
		await addByPostListUrl(downloadManage, urls[i]);
		await DownloadManage.utils.sleep(100);
	}
}

/**
 * 投稿リストURLからURLリストに追加
 * @param downloadManage ダウンロード設定
 * @param url
 */
async function addByPostListUrl(downloadManage: DownloadManage, url: string): Promise<void> {
	const postList = DownloadManage.utils.httpGetAs<{ body: PostInfo[] }>(url).body;
	console.log(`投稿の数:${postList.length}`);
	for (const post of postList) {
		if (downloadManage.isLimitValid()) {
			if (post.body) {
				addByPostInfo(downloadManage, post);
			} else if (!post.isRestricted) {
				await DownloadManage.utils.sleep(100);
				addByPostInfo(downloadManage, getPostInfoById(post.id));
			}
		} else break;
	}
}

/**
 * 投稿IDからpostInfoを得る
 * @param postId 投稿ID
 */
function getPostInfoById(postId: string): PostInfo | undefined {
	return DownloadManage.utils.httpGetAs<{ body?: PostInfo }>(
		`https://api.fanbox.cc/post.info?postId=${postId}`,
	).body;
}

/**
 * postInfoオブジェクトからURLリストに追加する
 * @param downloadManage ダウンロード設定
 * @param postInfo 投稿情報オブジェクト
 */
function addByPostInfo(downloadManage: DownloadManage, postInfo: PostInfo | undefined) {
	if (!postInfo || (downloadManage.isIgnoreFree && postInfo.feeRequired === 0)) {
		return;
	}
	if (!postInfo.body || postInfo.isRestricted) {
		console.log(
			`取得できませんでした(支援がたりない？)\nfeeRequired: ${postInfo.feeRequired}@${postInfo.id}`,
		);
		return;
	}
	const postName = postInfo.title;
	const postObject = downloadManage.downloadObject.addPost(postName);
	postObject.setTags([downloadManage.getTagByFee(postInfo.feeRequired), ...postInfo.tags]);
	downloadManage.addFee(postInfo.feeRequired);
	downloadManage.addTags(...postInfo.tags);
	const header: string = ((url: string | null) => {
		if (url) {
			const ext = url.split('.').pop() ?? '';
			return `${postObject.getImageLinkTag(
				postObject.setCover('cover', ext, url),
			)}<h5>${postName}</h5>\n`;
		}
		return `<h5>${postName}</h5>\n<br>\n`;
	})(postInfo.coverImageUrl);

	let parsedText: string;
	switch (postInfo.type) {
		case 'image': {
			const images = postInfo.body.images.map((it) =>
				postObject.addFile(postName, it.extension, it.originalUrl),
			);
			const imageTags = images.map((it) => postObject.getImageLinkTag(it)).join('<br>\n');
			const text = postInfo.body.text
				.split('\n')
				.map((it) => `<span>${it}</span>`)
				.join('<br>\n');
			postObject.setHtml(header + imageTags + '<br>\n' + text);
			parsedText = `${postInfo.body.text}\n`;
			break;
		}
		case 'file': {
			const files = postInfo.body.files.map((it) =>
				postObject.addFile(it.name, it.extension, it.url),
			);
			const fileTags = files.map((it) => postObject.getAutoAssignedLinkTag(it)).join('<br>\n');
			const text = postInfo.body.text
				.split('\n')
				.map((it) => `<span>${it}</span>`)
				.join('<br>\n');
			postObject.setHtml(header + fileTags + '<br>\n' + text);
			parsedText = `${postInfo.body.text}\n`;
			break;
		}
		case 'article': {
			const images = convertImageMap(postInfo.body.imageMap, postInfo.body.blocks).map((it) =>
				postObject.addFile(postName, it.extension, it.originalUrl),
			);
			const files = convertFileMap(postInfo.body.fileMap, postInfo.body.blocks).map((it) =>
				postObject.addFile(it.name, it.extension, it.url),
			);
			const embeds = convertEmbedMap(postInfo.body.embedMap, postInfo.body.blocks);
			const urlEmbeds = convertUrlEmbedMap(postInfo.body.urlEmbedMap, postInfo.body.blocks);
			let cntImg = 0,
				cntFile = 0,
				cntEmbed = 0,
				cntUrlEmbed = 0;
			const body = postInfo.body.blocks
				.map((it) => {
					switch (it.type) {
						case 'p':
							return `<span>${it.text}</span>`;
						case 'header':
							return `<h2><span>${it.text}</span></h2>`;
						case 'file':
							return postObject.getAutoAssignedLinkTag(files[cntFile++]);
						case 'image':
							return postObject.getImageLinkTag(images[cntImg++]);
						case 'embed':
							// FIXME 型が分からないのでJSON化して中身だけ出す
							return `<span>${JSON.stringify(embeds[cntEmbed++])}</span>`;
						case 'url_embed': {
							const urlEmbedInfo = urlEmbeds[cntUrlEmbed++];
							switch (urlEmbedInfo.type) {
								case 'default':
									return postObject.getLinkTag(urlEmbedInfo.url, urlEmbedInfo.host);
								case 'html':
								case 'html.card':
									const iframeUrl = urlEmbedInfo.html.match(/<iframe.*src="(http.*)"/)?.[1];
									return iframeUrl
										? postObject.getLinkTag(iframeUrl, 'iframe link')
										: `\n${urlEmbedInfo.html}\n\n`;
								case 'fanbox.post':
									const url = `https://www.fanbox.cc/@${urlEmbedInfo.postInfo.creatorId}/posts/${urlEmbedInfo.postInfo.id}`;
									return postObject.getLinkTag(url, urlEmbedInfo.postInfo.title);
								default:
									// FIXME 型が分からないのでJSON化して中身だけ出す
									return `<span>${JSON.stringify(urlEmbedInfo)}</span>`;
							}
						}
						default:
							return console.error(`unknown block type: ${it.type}`);
					}
				})
				.join('<br>\n');
			postObject.setHtml(header + body);
			parsedText =
				postInfo.body.blocks
					.filter((it): it is TextBlock => it.type === 'p' || it.type === 'header')
					.map((it) => it.text)
					.join('\n') + '\n';
			break;
		}
		case 'text': {
			const body = postInfo.body.text
				.split('\n')
				.map((it) => `<span>${it}</span>`)
				.join('<br>\n');
			parsedText = postInfo.body.text;
			postObject.setHtml(header + body);
			break;
		}
		default:
			parsedText = `不明なタイプ\n${postInfo.type}@${postInfo.id}\n`;
			console.log(`不明なタイプ\n${postInfo.type}@${postInfo.id}`);
			break;
	}

	const informationObject = {
		postId: postInfo.id,
		title: postInfo.title,
		creatorId: postInfo.creatorId,
		fee: postInfo.feeRequired,
		publishedDatetime: postInfo.publishedDatetime,
		updatedDatetime: postInfo.updatedDatetime,
		tags: postInfo.tags,
		likeCount: postInfo.likeCount,
		commentCount: postInfo.commentCount,
	};
	if (DownloadManage.isExportJson) {
		postObject.setInfo(JSON.stringify({ ...informationObject, parsedText }));
	} else {
		const exportInfoText = (Object.keys(informationObject) as (keyof typeof informationObject)[])
			.map((key) => `${key}:${JSON.stringify(informationObject[key])}`)
			.join('\n');
		postObject.setInfo(exportInfoText + '\nparsedText:\n' + parsedText);
	}
	downloadManage.decrementLimit();
}

function convertImageMap(imageMap: Record<string, ImageInfo>, blocks: Block[]): ImageInfo[] {
	const imageOrder = blocks
		.filter((it): it is ImageBlock => it.type === 'image')
		.map((it) => it.imageId);
	const imageKeyOrder = (s: string) => imageOrder.indexOf(s) ?? imageOrder.length;
	return Object.keys(imageMap)
		.sort((a, b) => imageKeyOrder(a) - imageKeyOrder(b))
		.map((it) => imageMap[it]);
}

function convertFileMap(fileMap: Record<string, FileInfo>, blocks: Block[]): FileInfo[] {
	const fileOrder = blocks
		.filter((it): it is FileBlock => it.type === 'file')
		.map((it) => it.fileId);
	const fileKeyOrder = (s: string) => fileOrder.indexOf(s) ?? fileOrder.length;
	return Object.keys(fileMap)
		.sort((a, b) => fileKeyOrder(a) - fileKeyOrder(b))
		.map((it) => fileMap[it]);
}

function convertEmbedMap(embedMap: Record<string, EmbedInfo>, blocks: Block[]): EmbedInfo[] {
	const embedOrder = blocks
		.filter((it): it is EmbedBlock => it.type === 'embed')
		.map((it) => it.embedId);
	const embedKeyOrder = (s: string) => embedOrder.indexOf(s) ?? embedOrder.length;
	return Object.keys(embedMap)
		.sort((a, b) => embedKeyOrder(a) - embedKeyOrder(b))
		.map((it) => embedMap[it]);
}

function convertUrlEmbedMap(
	urlEmbedMap: Record<string, UrlEmbedInfo>,
	blocks: Block[],
): UrlEmbedInfo[] {
	const urlEmbedOrder = blocks
		.filter((it): it is UrlEmbedBlock => it.type === 'url_embed')
		.map((it) => it.urlEmbedId);
	const urlEmbedKeyOrder = (s: string) => urlEmbedOrder.indexOf(s) ?? urlEmbedOrder.length;
	return Object.keys(urlEmbedMap)
		.sort((a, b) => urlEmbedKeyOrder(a) - urlEmbedKeyOrder(b))
		.map((it) => urlEmbedMap[it]);
}
