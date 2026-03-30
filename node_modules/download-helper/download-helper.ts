/**
 * ダウンロード用のObject
 */
export type DownloadObj = { posts: Record<string, PostObj[]>, id: string };

/**
 * 投稿情報のObject
 */
export type PostObj = { name: string, info: string, files: Record<string, FileObj[]>, html: string, tags: string[], cover?: FileObj };

/**
 * ファイル用のObject
 */
export type FileObj = { url: string, name: string, extension: string };

/**
 * ダウンロード用JSON元オブジェクト
 */
export type DownloadJsonObj = {
    posts: {
        originalName: string,
        encodedName: string,
        informationText: string,
        htmlText: string,
        files: { url: string, originalName: string, encodedName: string }[],
        tags: string[],
        cover?: { url: string, name: string }
    }[];
    id: string;
    url: string;
    tags: string[];
    fileCount: number;
    postCount: number;
};

/**
 * ダウンロード用のUtilityクラス
 */
export class DownloadUtils {
    /**
     * 音声拡張子
     */
    audioExtension = /\.(mp3|m4a|ogg)$/;

    /**
     * 画像拡張子
     */
    imageExtension = /\.(apng|avif|gif|jpg|jpeg|jfif|pjpeg|pjp|png|svg|webp)$/;

    /**
     * 映像拡張子
     */
    videoExtension = /\.(mp4|webm|ogv)$/;

    /**
     * 音声ファイル判定
     * @param fileName 判定対象ファイル名
     */
    isAudio(fileName: string): boolean {
        return fileName.match(this.audioExtension) != null;
    }

    /**
     * 画像ファイル判定
     * @param fileName 判定対象ファイル名
     */
    isImage(fileName: string): boolean {
        return fileName.match(this.imageExtension) != null;
    }

    /**
     * 映像ファイル判定
     * @param fileName 判定対象ファイル名
     */
    isVideo(fileName: string): boolean {
        return fileName.match(this.videoExtension) != null;
    }

    /**
     * HTTP GET
     * @param url
     */
    httpGetAs<T = any>(url: string): T {
        const request = new XMLHttpRequest();
        request.open('GET', url, false);
        request.withCredentials = true;
        request.send(null);
        return JSON.parse(request.responseText) as T;
    }

    /**
     * 保存するファイル名のエンコード
     * 主にwindowsで使えないファイル名のエスケープ処理をする
     * @param name ファイル名
     */
    encodeFileName(name: string): string {
        return name
            .replace(/\//g, "／")
            .replace(/\\/g, "＼")
            .replace(/,/g, "，")
            .replace(/:/g, "：")
            .replace(/\*/g, "＊")
            .replace(/"/g, "“")
            .replace(/</g, "＜")
            .replace(/>/g, "＞")
            .replace(/\|/g, "｜")
            .trimEnd();
    }

    /**
     * URIのエンコード
     * @param name ファイル名
     */
    encodeURI(name: string): string {
        return this.encodeFileName(name).replaceAll(/[;,/?:@&=+$#]/g, encodeURIComponent)
    }

    /**
     * 拡張子の分割
     * @param name ファイル名
     */
    splitExt(name: string): string[] {
        return name.split(/(?=\.[^.]+$)/);
    }

    /**
     * 同一名の設定
     * @param name 名
     * @param extension 拡張子(.を含む)
     * @param length インデックスの最大値
     * @param index インデックス
     * @param isAsc 昇順か
     */
    getFileName(name: string, extension: string, length: number, index: number, isAsc: boolean): string {
        if (length <= 1) return `${name}${extension}`;
        return isAsc ? `${name}_${index + 1}${extension}` : `${name}_${length - index}${extension}`;
    }

    /**
     * quote
     * @param value quote対象
     */
    toQuoted(value: string): string {
        return `'${value.replaceAll('\'', '\\\'')}'`;
    }

    /**
     * テキストから投稿情報ファイルを作成する
     * @param informationText 元となるテキスト
     * @return name ファイル名, content ファイル内容
     */
    createInformationFile(informationText: string): { name: string, content: BlobPart[] } {
        try {
            const json = JSON.stringify(JSON.parse(informationText), null, "\t");
            return {name: 'info.json', content: [json]};
        } catch (e) {
            return {name: 'info.txt', content: [informationText]};
        }
    }

    /**
     * timeoutによる疑似スリーブ
     * @param ms ミリ秒
     */
    async sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * リトライ回数付きfetch
     * @param url
     * @param filename
     * @param limit 失敗時のリトライ回数
     */
    async fetchWithLimit({url, name}: { url: string, name: string }, limit: number): Promise<Blob | null> {
        if (limit < 0) return null;
        try {
            const blob = await fetch(url)
                .catch(e => {
                    throw new Error(e)
                })
                .then(r => r.ok ? r.blob() : null);
            return blob ? blob : await this.fetchWithLimit({url, name}, limit - 1);
        } catch (_) {
            console.error(`通信エラー: ${name}, ${url}`);
            await this.sleep(1000);
            return await this.fetchWithLimit({url, name}, limit - 1);
        }
    }

    /**
     * DOMによる外部スクリプト読み込み (importじゃだめなとき用)
     * @param url
     */
    async embedScript(url: string) {
        return new Promise((resolve, reject) => {
            let script = document.createElement("script");
            script.src = url;
            script.onload = () => resolve(script);
            script.onerror = (e) => reject(e);
            document.head.appendChild(script);
        });
    }
}

/**
 * ダウンロード用のオブジェクトラッパークラス
 */
export class DownloadObject {
    private readonly downloadObj: DownloadObj;
    private readonly utils: DownloadUtils;
    private readonly orderedPosts: PostObject[] = [];
    private url = "#main";
    private tags: string[] | undefined;

    constructor(id: string, utils: DownloadUtils) {
        this.downloadObj = {posts: {}, id};
        this.utils = utils;
    }

    stringify(): string {
        const downloadJson: DownloadJsonObj = {
            posts: this.orderedPosts.map(it => it.toJsonObjBy(this.downloadObj.posts)),
            id: this.downloadObj.id,
            url: this.url,
            tags: this.tags ?? this.collectTags(),
            postCount: this.countPost(),
            fileCount: this.countFile()
        };
        return JSON.stringify(downloadJson);
    }

    setUrl(url: string) {
        this.url = url;
    }

    setTags(tags: string[]) {
        this.tags = tags;
    }

    addPost(name: string): PostObject {
        const encodedName = this.utils.encodeFileName(name);
        if (this.downloadObj.posts[encodedName] === undefined) {
            this.downloadObj.posts[encodedName] = [];
        }
        const postObj: PostObj = {name, info: '', files: {}, html: '', tags: []};
        this.downloadObj.posts[encodedName].push(postObj);
        const postObject = new PostObject(postObj, this.utils);
        this.orderedPosts.push(postObject);
        return postObject;
    }

    private countPost(): number {
        return Object.values(this.downloadObj.posts).reduce((s, posts) => s + posts.length, 0);
    }

    private countFile(): number {
        return Object.values(this.downloadObj.posts).reduce((allFileSize, posts) =>
                allFileSize + posts.reduce((postFileSize, post) =>
                        postFileSize + Object.values(post.files).reduce((s, files) =>
                            s + files.length, 0
                        ), 0
                ), 0
        );
    }

    private collectTags(): string[] {
        const tags = new Set<string>();
        Object.values(this.downloadObj.posts).forEach(posts =>
            posts.forEach(post =>
                post.tags.forEach(tag =>
                    tags.add(tag)
                )
            )
        );
        return [...tags];
    }
}

/**
 * 投稿情報オブジェクトラッパークラス
 */
export class PostObject {
    private readonly postObj: PostObj;
    private readonly utils: DownloadUtils;

    constructor(postObj: PostObj, utils: DownloadUtils) {
        this.postObj = postObj;
        this.utils = utils;
    }

    setInfo(info: string) {
        this.postObj.info = info;
    }

    setHtml(html: string) {
        this.postObj.html = html;
    }

    setTags(tags: string[]) {
        this.postObj.tags = tags;
    }

    setCover(name: string, extension: string, url: string): FileObject {
        const fileObj: FileObj = {name, extension: extension ? `.${extension}` : "", url};
        this.postObj.cover = fileObj;
        return new FileObject(fileObj, this.utils);
    }

    addFile(name: string, extension: string, url: string): FileObject {
        const encodedName = this.utils.encodeFileName(name);
        if (this.postObj.files[encodedName] === undefined) {
            this.postObj.files[encodedName] = [];
        }
        const fileObj: FileObj = {name, extension: extension ? `.${extension}` : "", url};
        this.postObj.files[encodedName].push(fileObj);
        return new FileObject(fileObj, this.utils);
    }

    getAutoAssignedLinkTag(fileObject: FileObject): string {
        const ext = fileObject.getEncodedExtension();
        switch (true) {
            case this.utils.isAudio(ext):
                return this.getAudioLinkTag(fileObject);
            case this.utils.isImage(ext):
                return this.getImageLinkTag(fileObject);
            case this.utils.isVideo(ext):
                return this.getVideoLinkTag(fileObject);
            default:
                return this.getFileLinkTag(fileObject);
        }
    }

    getAudioLinkTag(fileObject: FileObject): string {
        const filePath = this.getCurrentFilePath(fileObject);
        return `<a class="hl" href="${filePath}" download="${fileObject.getEncodedName() + fileObject.getEncodedExtension()}"><div class="post card">\n` +
            `<div class="card-header">${fileObject.getOriginalName()}</div>\n` +
            `<audio class="card-img-top" src="${filePath}" controls/>\n</div></a>`;
    }

    getLinkTag(url: string, title: string): string {
        return `<a class="hl" href="${url}"><div class="post card text-center"><p class="pt-2">\n` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-up-left" viewBox="0 0 16 16">\n` +
            `<path fill-rule="evenodd" d="M7.364 3.5a.5.5 0 0 1 .5-.5H14.5A1.5 1.5 0 0 1 16 4.5v10a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 3 14.5V7.864a.5.5 0 1 1 1 0V14.5a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-10a.5.5 0 0 0-.5-.5H7.864a.5.5 0 0 1-.5-.5z"/>\n` +
            `<path fill-rule="evenodd" d="M0 .5A.5.5 0 0 1 .5 0h5a.5.5 0 0 1 0 1H1.707l8.147 8.146a.5.5 0 0 1-.708.708L1 1.707V5.5a.5.5 0 0 1-1 0v-5z"/>\n` +
            `</svg> ${title}</p></div></a>`;
    }

    getFileLinkTag(fileObject: FileObject): string {
        const filePath = this.getCurrentFilePath(fileObject);
        return `<a class="hl" href="${filePath}" download="${fileObject.getEncodedName() + fileObject.getEncodedExtension()}">` +
            `<div class="post card text-center"><p class="pt-2">\n` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-download" viewBox="0 0 16 16">\n` +
            `<path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>\n` +
            `<path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>\n` +
            `</svg> ${fileObject.getOriginalName() + fileObject.getOriginalExtension()}</p></div></a>`;
    }

    getImageLinkTag(fileObject: FileObject): string {
        const filePath = this.getCurrentFilePath(fileObject);
        return `<a class="hl" href="${filePath}" download="${fileObject.getEncodedName() + fileObject.getEncodedExtension()}"><div class="post card">\n` +
            `<img class="card-img-top" src="${filePath}" alt="${fileObject.getOriginalName()}"/>\n</div></a>`;
    }

    getVideoLinkTag(fileObject: FileObject): string {
        const filePath = this.getCurrentFilePath(fileObject);
        return `<a class="hl" href="${filePath}" download="${fileObject.getEncodedName() + fileObject.getEncodedExtension()}"><div class="post card">\n` +
            `<video class="card-img-top" src="${filePath}" controls/>\n</div></a>`;
    }

    private getCurrentFilePath(fileObject: FileObject): string {
        const encodedName = fileObject.getEncodedName();
        if (fileObject.equals(this.postObj.cover)) {
            const fileName = this.utils.getFileName(encodedName, fileObject.getEncodedExtension(), 1, 0, true);
            return `./${this.utils.encodeURI(fileName)}`;
        }
        if (this.postObj.files[encodedName] === undefined) {
            throw new Error(`file object is undefined: ${fileObject.getOriginalName()}`)
        }
        const index = this.postObj.files[encodedName].findIndex(it => fileObject.equals(it));
        if (index < 0) {
            throw new Error(`file object is not found: ${fileObject.getOriginalName()}`)
        }
        const fileName = this.utils.getFileName(encodedName, fileObject.getEncodedExtension(), this.postObj.files[encodedName].length, index, true);
        return `./${this.utils.encodeURI(fileName)}`;
    }

    toJsonObjBy(posts: Record<string, PostObj[]>): DownloadJsonObj['posts'][number] {
        const key = this.utils.encodeFileName(this.postObj.name);
        const postIndex = posts[key]?.indexOf(this.postObj);
        if (postIndex === undefined || postIndex < 0) {
            throw new Error(`post object is not found: ${this.postObj.name}`);
        }
        const encodedName = this.utils.getFileName(key, "", posts[key].length, postIndex, false);
        const cover = this.postObj.cover ? {
            url: this.postObj.cover.url,
            name: this.utils.getFileName(this.postObj.cover.name, this.postObj.cover.extension, 1, 0, true)
        } : undefined;
        return {
            originalName: this.postObj.name,
            encodedName,
            informationText: this.postObj.info,
            htmlText: this.postObj.html,
            files: this.collectFiles(),
            tags: this.postObj.tags,
            cover
        };
    }

    private collectFiles(): DownloadJsonObj['posts'][number]['files'] {
        // 順序自由
        const ret: DownloadJsonObj['posts'][number]['files'] = [];
        for (const [key, fileObjArray] of Object.entries(this.postObj.files)) {
            let fileIndex = 0;
            for (const fileObj of fileObjArray) {
                const extension = fileObj.extension ? this.utils.encodeFileName(fileObj.extension) : "";
                const encodedName = this.utils.getFileName(key, extension, fileObjArray.length, fileIndex++, true);
                ret.push({
                    url: fileObj.url,
                    originalName: fileObj.name,
                    encodedName
                });
            }
        }
        return ret;
    }
}

/**
 * ファイルオブジェクトラッパークラス
 */
export class FileObject {
    private readonly fileObj: FileObj;
    private readonly utils: DownloadUtils;

    constructor(fileObj: FileObj, utils: DownloadUtils) {
        this.fileObj = fileObj;
        this.utils = utils;
    }

    getEncodedName(): string {
        return this.utils.encodeFileName(this.fileObj.name);
    }

    getEncodedExtension(): string {
        return this.utils.encodeFileName(this.fileObj.extension);
    }

    getOriginalName(): string {
        return this.fileObj.name;
    }

    getOriginalExtension(): string {
        return this.fileObj.extension;
    }

    getUrl(): string {
        return this.fileObj.url;
    }

    equals(obj: any): boolean {
        if (typeof obj != 'object') {
            return false;
        }
        return obj.name === this.fileObj.name && obj.url === this.fileObj.url;
    }
}

/**
 * ダウンロード用のヘルパー
 */
export class DownloadHelper {
    private readonly utils: DownloadUtils;

    constructor(utils: DownloadUtils) {
        this.utils = utils;
    }

    /**
     * bootstrapのCSS情報
     */
    bootCSS = {
        href: "https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/css/bootstrap.min.css",
        integrity: "sha384-giJF6kkoqNQ00vy+HMDP7azOuL0xtbfIcaT9wjKHr8RbDVddVHyTfAAsrekwKmP1",
    };

    /**
     * bootstrapのjs情報
     */
    bootJS = {
        src: "https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/js/bootstrap.bundle.min.js",
        integrity: "sha384-ygbV9kiqUc6oa4msXn9868pTtWMgiQaeYH7/t7LECLbyPA2x65Kgf80OJFdroafW",
    };

    /**
     * Vueのjs情報
     */
    vueJS = {
        src: "https://unpkg.com/vue@3.2.28/dist/vue.global.js",
    };

    /**
     * ダウンロード用のUIを作成する
     * @param title ダウンローダーの名前
     */
    async createDownloadUI(title: string) {
        document.head.innerHTML = "";
        document.body.innerHTML = "";
        document.getElementsByTagName("html")[0].style.height = "100%";
        document.body.style.height = "100%";
        document.body.style.margin = "0";
        document.title = title;

        let bootLink = document.createElement("link");
        bootLink.href = this.bootCSS.href;
        bootLink.rel = "stylesheet";
        bootLink.integrity = this.bootCSS.integrity;
        bootLink.crossOrigin = "anonymous";
        document.head.appendChild(bootLink);

        let bodyDiv = document.createElement("div");
        bodyDiv.style.display = "flex";
        bodyDiv.style.alignItems = "center";
        bodyDiv.style.justifyContent = "center";
        bodyDiv.style.flexDirection = "column";
        bodyDiv.style.height = "100%";
        let inputDiv = document.createElement("div");
        inputDiv.className = "input-group mb-2";
        inputDiv.style.width = "400px";
        let input = document.createElement("input");
        input.type = "text"
        input.className = "form-control"
        input.placeholder = "ここにJSONを貼り付け"
        inputDiv.appendChild(input);
        let buttonDiv = document.createElement("div");
        buttonDiv.className = "input-group-append";
        let button = document.createElement("button");
        button.className = "btn btn-outline-secondary btn-labeled";
        button.type = "button";
        button.innerText = "Download";
        buttonDiv.appendChild(button);
        inputDiv.appendChild(buttonDiv);
        bodyDiv.appendChild(inputDiv);
        let progressDiv = document.createElement("div");
        progressDiv.className = "progress mb-3";
        progressDiv.style.width = "400px";
        let progress = document.createElement("div");
        progress.className = "progress-bar";
        // @ts-ignore
        progress["role"] = "progressbar";
        // @ts-ignore
        progress["aria-valuemin"] = "0";
        // @ts-ignore
        progress["aria-valuemax"] = "100";
        // @ts-ignore
        progress["aria-valuenow"] = "0";
        progress.style.width = "0%"
        progress.innerText = "0%";
        const setProgress = (n: number) => {
            // @ts-ignore
            progress["aria-valuenow"] = `${n}`;
            progress.style.width = `${n}%`;
            progress.innerText = `${n}%`;
        };
        progressDiv.appendChild(progress);
        bodyDiv.appendChild(progressDiv);
        let infoDiv = document.createElement("div");
        infoDiv.style.width = "350px";
        let checkBoxDiv = document.createElement("div");
        checkBoxDiv.className = "form-check float-start";
        let checkBox = document.createElement("input");
        checkBox.className = "form-check-input";
        checkBox.type = "checkbox";
        checkBox.id = "LogCheck";
        checkBox.checked = true;
        checkBoxDiv.appendChild(checkBox);
        let checkBoxLabel = document.createElement("label");
        checkBoxLabel.className = "form-check-label";
        // @ts-ignore
        checkBoxLabel["for"] = "LogCheck";
        checkBoxLabel.innerText = "ログを自動スクロール";
        checkBoxDiv.appendChild(checkBoxLabel);
        infoDiv.appendChild(checkBoxDiv);
        let remainTimeDiv = document.createElement("div");
        remainTimeDiv.className = "float-end";
        remainTimeDiv.innerText = "残りおよそ -:--";
        const setRemainTime = (r: string) => remainTimeDiv.innerText = `残りおよそ ${r}`;
        infoDiv.appendChild(remainTimeDiv);
        bodyDiv.appendChild(infoDiv);
        let textarea = document.createElement("textarea");
        textarea.className = "form-control";
        textarea.readOnly = true;
        textarea.style.resize = "both";
        textarea.style.width = "500px";
        textarea.style.height = "80px";
        const textLog = (t: string) => {
            textarea.value += `${t}\n`;
            if (checkBox.checked) {
                textarea.scrollTop = textarea.scrollHeight;
            }
        };
        bodyDiv.appendChild(textarea);
        document.body.appendChild(bodyDiv);

        let bootScript = document.createElement("script");
        bootScript.src = this.bootJS.src;
        bootScript.integrity = this.bootJS.integrity;
        bootScript.crossOrigin = "anonymous";
        document.body.appendChild(bootScript);
        const downloadFun = this.downloadZip.bind(this);

        button.onclick = async () => {
            button.disabled = true;
            const loadingFun = ((event: BeforeUnloadEvent) => event.returnValue = `downloading`);
            window.addEventListener('beforeunload', loadingFun);
            try {
                await downloadFun(JSON.parse(input.value), setProgress, textLog, setRemainTime);
            } catch (e) {
                textLog('エラー出た');
                console.error(e);
            } finally {
                window.removeEventListener("beforeunload", loadingFun);
            }
        };
    }

    /**
     * ZIPでダウンロード
     * @param downloadObj ダウンロード対象オブジェクト
     * @param progress 進捗率出力関数
     * @param log ログ出力関数
     * @param remainTime 終了予測出力関数
     */
    async downloadZip(downloadObj: any, progress: (n: number) => void, log: (s: string) => void, remainTime: (r: string) => void) {
        if (!this.isDownloadJsonObj(downloadObj)) throw new Error('ダウンロード対象オブジェクトの型が不正');
        const ui = this;
        const utils = this.utils;
        await utils.embedScript('https://cdn.jsdelivr.net/npm/web-streams-polyfill@2.0.2/dist/ponyfill.min.js');
        await utils.embedScript('https://cdn.jsdelivr.net/npm/streamsaver@2.0.3/StreamSaver.js');
        await utils.embedScript('https://cdn.jsdelivr.net/npm/streamsaver@2.0.3/examples/zip-stream.js');
        const encodedId = utils.encodeFileName(downloadObj.id);
        const fileStream = streamSaver.createWriteStream(`${encodedId}.zip`);

        const readableZipStream = new createWriter({
            async pull(ctrl) {
                const startTime = Math.floor(Date.now() / 1000);
                let count = 0;
                const enqueue = (fileBits: BlobPart[], path: string) => ctrl.enqueue(new File(fileBits, `${encodedId}/${path}`));
                log(`@${downloadObj.id} 投稿:${downloadObj.postCount} ファイル:${downloadObj.fileCount}`);
                // ルートhtml
                enqueue([ui.createRootHtmlFromPosts(downloadObj)], 'index.html');
                // 投稿処理
                let postCount = 0;
                for (const post of downloadObj.posts) {
                    log(`${post.originalName} (${++postCount}/${downloadObj.postCount})`);
                    // 投稿情報+html
                    const informationFile = utils.createInformationFile(post.informationText);
                    enqueue(informationFile.content, `${post.encodedName}/${utils.encodeFileName(informationFile.name)}`);
                    enqueue([ui.createHtmlFromBody(post.originalName, post.htmlText)], `${post.encodedName}/index.html`);
                    // カバー画像
                    if (post.cover) {
                        log(`download ${post.cover.name}`);
                        const blob = await utils.fetchWithLimit(post.cover, 1);
                        if (blob) {
                            enqueue([blob], `${post.encodedName}/${post.cover.name}`);
                        }
                    }
                    // ファイル処理
                    let fileCount = 0;
                    for (const file of post.files) {
                        log(`download ${file.encodedName} (${++fileCount}/${post.files.length})`);
                        const blob = await utils.fetchWithLimit({url: file.url, name: file.encodedName}, 1);
                        if (blob) {
                            enqueue([blob], `${post.encodedName}/${file.encodedName}`);
                        } else {
                            console.error(`${file.encodedName}(${file.url})のダウンロードに失敗、読み飛ばすよ`);
                            log(`${file.encodedName}のダウンロードに失敗`);
                        }
                        count++;
                        setTimeout(() => {
                            const remain = Math.floor(Math.abs(Math.floor(Date.now() / 1000) - startTime) * (downloadObj.fileCount - count) / count);
                            const h = remain / (60 * 60) | 0;
                            const m = Math.ceil((remain - 60 * 60 * h) / 60);
                            remainTime(`${h}:${('00' + m).slice(-2)}`);
                            progress(count * 100 / downloadObj.fileCount | 0);
                        }, 0);
                        await utils.sleep(100);
                    }
                }
                ctrl.close();
            }
        });

        // more optimized
        if (window.WritableStream && readableZipStream.pipeTo) {
            return readableZipStream.pipeTo(fileStream).then(() => console.log('done writing'));
        }

        // less optimized
        const writer = fileStream.getWriter();
        const reader = readableZipStream.getReader();
        const pump: () => Promise<void> = () => reader.read().then((res: any) =>
            res.done ? writer.close() : writer.write(res.value).then(pump)
        );
        await pump();
    }

    /**
     * 型検証
     * @param target 検証対象
     */
    isDownloadJsonObj(target: any): target is DownloadJsonObj {
        switch (true) {
            case typeof target !== 'object':
                console.error('ダウンロード用オブジェクトの型が不正(対象がobjectでない)', target);
                return false;
            case typeof target.postCount !== 'number':
                console.error('ダウンロード用オブジェクトの型が不正(postCountが数値でない)', target.postCount);
                return false;
            case typeof target.fileCount !== 'number':
                console.error('ダウンロード用オブジェクトの型が不正(fileCountが数値でない)', target.fileCount);
                return false;
            case typeof target.id !== 'string':
                console.error('ダウンロード用オブジェクトの型が不正(idが文字列でない)', target.id);
                return false;
            case typeof target.url !== 'string':
                console.error('ダウンロード用オブジェクトの型が不正(urlが文字列でない)', target.url);
                return false;
            case !Array.isArray(target.posts):
                console.error('ダウンロード用オブジェクトの型が不正(postsが配列でない)', target.posts);
                return false;
            case !Array.isArray(target.tags):
                console.error('ダウンロード用オブジェクトの型が不正(tagsが配列でない)', target.tags);
                return false;
        }
        return !target.posts.some((it: any) => {
            switch (true) {
                case typeof it !== 'object':
                    console.error('ダウンロード用オブジェクトの型が不正(postsの値にobjectでないものが含まれる)', it, target.posts);
                    return true;
                case typeof it.informationText !== 'string':
                    console.error('ダウンロード用オブジェクトの型が不正(postsの値にinformationTextが文字列でないものが含まれる)', it.informationText, target.posts);
                    return true;
                case typeof it.htmlText !== 'string':
                    console.error('ダウンロード用オブジェクトの型が不正(postsの値にhtmlTextが文字列でないものが含まれる)', it.htmlText, target.posts);
                    return true;
                case  !Array.isArray(it.files):
                    console.error('ダウンロード用オブジェクトの型が不正(postsの値にfilesが配列でないものが含まれる)', it.files, target.posts);
                    return true;
                case  !Array.isArray(it.tags):
                    console.error('ダウンロード用オブジェクトの型が不正(postsの値にtagsが配列でないものが含まれる)', it.tags, target.posts);
                    return true;
                case it.files.some((f: any) => {
                    switch (true) {
                        case typeof f !== 'object':
                            console.error('ダウンロード用オブジェクトの型が不正(postsのfilesの値にオブジェクトでないものが含まれる)', f, it.files);
                            return true;
                        case typeof f.url !== 'string':
                            console.error('ダウンロード用オブジェクトの型が不正(postsのfilesの値にurlが文字列でないものが含まれる)', f.url, it.files);
                            return true;
                        case typeof f.originalName !== 'string':
                            console.error('ダウンロード用オブジェクトの型が不正(postsのfilesの値にoriginalNameが文字列でないものが含まれる)', f.originalName, it.files);
                            return true;
                        case typeof f.encodedName !== 'string':
                            console.error('ダウンロード用オブジェクトの型が不正(postsのfilesの値にencodedNameが文字列でないものが含まれる)', f.encodedName, it.files);
                            return true;
                        case it.cover === undefined:
                            return false;
                        case typeof it.cover !== 'object':
                            console.error('ダウンロード用オブジェクトの型が不正(postsの値にcoverがobjectでないものが含まれる)', it.cover, target.posts);
                            return true;
                        case typeof it.cover?.url !== 'string':
                            console.error('ダウンロード用オブジェクトの型が不正(postsのcoverの値にurlが文字列でないものが含まれる)', it.cover?.url, it.cover);
                            return true;
                        case typeof it.cover?.name !== 'string':
                            console.error('ダウンロード用オブジェクトの型が不正(postsのcoverの値にnameが文字列でないものが含まれる)', it.cover?.name, it.cover);
                            return true;
                        default:
                            return false;
                    }
                }):
                    return true;
                default:
                    return false;
            }
        });
    }

    /**
     * ルートのhtmlを作成する
     * @param downloadObj ルートObject
     */
    createRootHtmlFromPosts(downloadObj: DownloadJsonObj): string {
        const header = `<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="utf-8" />\n<title>${downloadObj.id}</title>\n` +
            `<link href="${this.bootCSS.href}" rel="stylesheet" integrity="${this.bootCSS.integrity}" crossOrigin="anonymous">\n` +
            '<style>div.main{width: 600px; float: none; margin: 65px auto 0}div.root{width: 400px}div.post{width: 600px}' +
            'a.hl,a.hl:hover{color: inherit;text-decoration: none;}div.card{float: none; margin: 0 auto;}' +
            'img.gray-card{height: 210px;background-color: gray;}' +
            'div.gray-carousel{height: 210px; width: 400px;background-color: gray;}' +
            'img.pd-carousel{height: 210px; padding: 15px;}</style>\n' +
            `</head>\n<body>\n<div class="main" id="main">\n`;
        const body = `<nav class="navbar navbar-expand-lg navbar-dark bg-dark fixed-top"><div class="container-fluid">\n` +
            `<a class="navbar-brand" href="${downloadObj.url}">${downloadObj.id}</a>\n` +
            `<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#dd" aria-controls="dd" aria-expanded="false" aria-label="Toggle navigation">\n` +
            `<span class="navbar-toggler-icon"></span>\n` +
            `</button>\n` +
            `<div class="collapse navbar-collapse" id="dd"><ul class="navbar-nav">\n` +
            `<li class="nav-item dropdown">\n` +
            `<a class="nav-link dropdown-toggle" href="#" id="navbarDarkDropdownMenuLink" role="button" data-bs-toggle="dropdown" aria-expanded="false">Tags</a>\n` +
            `<ul class="dropdown-menu dropdown-menu-dark" aria-labelledby="dd">\n` +
            `<li v-for="(tag,i) in [${downloadObj.tags.map(tag => this.utils.toQuoted(tag)).join(",")}]">\n` +
            ` <div class="form-check mx-1">\n` +
            `<input class="form-check-input" type="checkbox" v-model="selected" :value="tag" :id="'box'+(i+1)">\n` +
            `<label class="form-check-label" :for="'box'+(i+1)">{{tag}}</label>\n` +
            `</div>\n</li>\n` +
            `</ul>\n</li>\n</ul></div>\n</div></nav>\n\n` +
            downloadObj.posts.map(post => `<div v-show="isVisible([${post.tags.map(tag => this.utils.toQuoted(tag)).join(", ")}], selected)">\n` +
                `<a class="hl" href="./${this.utils.encodeURI(post.encodedName)}/index.html"><div class="root card">\n` +
                this.createCoverHtmlFromPost(post) +
                `<div class="card-body"><h5 class="card-title">${post.originalName}</h5></div>\n</div></a><br>\n</div>\n`
            ).join('\n');
        const footer = `\n</div>\n` +
            `<script src="${this.vueJS.src}"></script>\n` +
            `<script>\nVue.createApp({\ndata() {return { selected: [] }},` +
            `methods: {\n isVisible(tags, selected) {\n  if (!selected.length) return true\n  return selected.every(it => tags.includes(it))\n }\n}\n` +
            `}).mount('#main')\n</script>\n` +
            `<script src="${this.bootJS.src}" integrity="${this.bootJS.integrity}" crossOrigin="anonymous"></script>\n` +
            '</body></html>';
        return header + body + footer;
    }

    /**
     * cover画像htmlの生成
     * カバー画像が無い場合は投稿画像をスライドショーする
     * @param post 投稿情報オブジェクト
     */
    createCoverHtmlFromPost(post: DownloadJsonObj['posts'][number]): string {
        const postUri = `./${this.utils.encodeURI(post.encodedName)}/`;
        if (post.cover) {
            return `<img class="card-img-top gray-card" src="${postUri}${this.utils.encodeURI(post.cover.name)}" alt="カバー画像"/>\n`;
        }
        const images = post.files.filter(file => this.utils.isImage(file.encodedName));
        if (images.length > 0) {
            return '<div class="carousel slide" data-bs-ride="carousel" data-interval="1000"><div class="carousel-inner">' +
                '\n<div class="carousel-item active">' +
                images.map(img =>
                    '<div class="d-flex justify-content-center gray-carousel">' +
                    `<img src="${postUri}${this.utils.encodeURI(img.encodedName)}" class="d-block pd-carousel" height="180px"/></div>`
                ).join('</div>\n<div class="carousel-item">') +
                '</div>\n</div></div>\n';
        } else {
            return `<img class="card-img-top gray-card"/>\n`;
        }
    }

    /**
     * 投稿再現htmlの生成
     * @param title 投稿
     * @param body
     */
    createHtmlFromBody(title: string, body: string): string {
        return `<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="utf-8" />\n<title>${title}</title>\n` +
            `<link href="${this.bootCSS.href}" rel="stylesheet" integrity="${this.bootCSS.integrity}" crossOrigin="anonymous">\n` +
            '<style>div.main{width: 600px; float: none; margin: 0 auto}div.root{width: 400px}div.post{width: 600px}' +
            'a.hl,a.hl:hover{color: inherit;text-decoration: none;}div.card{float: none; margin: 0 auto;}' +
            'img.gray-card{height: 210px;background-color: gray;}' +
            'div.gray-carousel{height: 210px; width: 400px;background-color: gray;}' +
            'img.pd-carousel{height: 210px; padding: 15px;}</style>\n' +
            `</head>\n<body>\n<div class="main">\n${body}\n</div>\n` +
            `<script src="${this.bootJS.src}" integrity="${this.bootJS.integrity}" crossOrigin="anonymous"></script>\n` +
            '</body></html>';
    }
}

declare const streamSaver: {
    createWriteStream: (
        fileName: string,
        options?: {
            size: null,
            pathname: null,
            writableStrategy: undefined,
            readableStrategy: undefined
        }
    ) => WritableStream
};

declare const createWriter: new(underlyingSource: {
    pull: (ctrl: { enqueue: (file: File) => void, close: () => void }) => Promise<void>
}) => ReadableStream & { pull: () => void };

