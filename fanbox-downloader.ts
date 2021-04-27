let dlList: { items: { [p: string]: { url: string; fileName: string }[] }; postCount: number; fileCount: number; id: string } =
    {items: {}, postCount: 0, fileCount: 0, id: 'undefined'};
let limit: number | null = 0;
let isIgnoreFree = false;

// 投稿の情報を個別に取得しない（基本true）
let isEco = true;

// メイン
(window as any).fanboxDownloader = async function () {
    if (window.location.origin === "https://downloads.fanbox.cc") {
        document.body.innerHTML = "";
        let tb = document.createElement("input");
        tb.type = "text";
        let bt = document.createElement("input");
        bt.type = "button";
        bt.value = "ok";
        document.body.appendChild(tb);
        document.body.appendChild(bt);
        bt.onclick = function () {
            downloadZip(tb.value).then(() => {
            });
        };
        return;
    } else if (window.location.origin === "https://www.fanbox.cc") {
        const userIdReg = window.location.href.match(/fanbox.cc\/@(.*)/);
        if (userIdReg == null || !userIdReg[1]) {
            alert("しらないURL");
            return;
        }
        dlList.id = userIdReg[1];
        const postIdReg = window.location.href.match(/fanbox.cc\/@.*\/posts\/(\d*)/);
        if (postIdReg && postIdReg[1]) addByPostInfo(getPostInfoById(postIdReg[1]));
        else await getItemsById(userIdReg[1]);
    } else if (window.location.href.match(/^https:\/\/(.*)\.fanbox\.cc\//)) {
        const userIdReg = window.location.href.match(/^https:\/\/(.*)\.fanbox\.cc\//);
        const postIdReg = window.location.href.match(/.*\.fanbox\.cc\/posts\/(\d*)/);
        if (userIdReg == null || !userIdReg[1]) {
            alert("しらないURL");
            return;
        }
        dlList.id = userIdReg[1];
        if (postIdReg && postIdReg[1]) addByPostInfo(getPostInfoById(postIdReg[1]));
        else await getItemsById(userIdReg[1]);
    } else {
        alert(`ここどこですか(${window.location.href})`);
        return;
    }
    const json = JSON.stringify(dlList);
    console.log(json);
    await navigator.clipboard.writeText(json);
    alert("jsonをコピーしました。downloads.fanbox.ccで実行して貼り付けてね");
};

// 投稿リストURLからURLリストに追加
function addByPostListUrl(url: string, eco: boolean) {
    const postList = JSON.parse(fetchUrl(url));
    const items = postList.body.items;

    console.log("投稿の数:" + items.length);
    for (let i = 0; i < items.length && limit !== 0; i++) {
        dlList.postCount++;
        // ecoがtrueならpostInfoを個別に取得しない
        if (eco) {
            console.log(items[i]);
            addByPostInfo(items[i]);
        } else {
            addByPostInfo(getPostInfoById(items[i].id));
        }
    }
    return postList.body.nextUrl;
}

// HTTP GETするおまじない
function fetchUrl(url: string): string {
    const request = new XMLHttpRequest();
    request.open('GET', url, false);
    request.withCredentials = true;
    request.send(null);
    return request.responseText;
}

// 投稿IDからitemsを得る
async function getItemsById(postId: string) {
    dlList.items = {};
    isIgnoreFree = confirm("無料コンテンツを省く？");
    const res = prompt("取得制限数を入力 キャンセルで全て取得");
    limit = res ? parseInt(res) ?? null : null;
    let count = 1, nextUrl;
    nextUrl = `https://api.fanbox.cc/post.listCreator?creatorId=${postId}&limit=100`;
    for (; nextUrl != null; count++) {
        console.log(count + "回目");
        nextUrl = addByPostListUrl(nextUrl, isEco);
        await setTimeout(() => {
        }, 100);
    }
}

// 投稿IDからpostInfoを得る
function getPostInfoById(postId: string) {
    return JSON.parse(fetchUrl(`https://api.fanbox.cc/post.info?postId=${postId}`)).body;
}

// postInfoオブジェクトからURLリストに追加する
function addByPostInfo(postInfo: any) {
    const title = postInfo.title;
    const date = postInfo.publishedDatetime;
    if (isIgnoreFree && (postInfo.feeRequired === 0)) {
        return;
    }

    if (postInfo.body == null) {
        console.log(`取得できませんでした(支援がたりない？)\nfeeRequired: ${postInfo.feeRequired}@${postInfo.id}`);
        return;
    }

    if (postInfo.type === "image") {
        const images = postInfo.body.images;
        for (let i = 0; i < images.length; i++) {
            addUrl(title, images[i].originalUrl, `${date} ${title} ${i + 1}.${images[i].extension}`);
        }
    } else if (postInfo.type === "file") {
        const files = postInfo.body.files;
        for (let i = 0; i < files.length; i++) {
            addUrl(title, files[i].url, `${date} ${title} ${files[i].name}.${files[i].extension}`);
        }
    } else if (postInfo.type === "article") {
        const imageMap = postInfo.body.imageMap;
        const imageMapKeys = Object.keys(imageMap);
        for (let i = 0; i < imageMapKeys.length; i++) {
            addUrl(title, imageMap[imageMapKeys[i]].originalUrl, `${date} ${title} ${i + 1}.${imageMap[imageMapKeys[i]].extension}`);
        }

        const fileMap = postInfo.body.fileMap;
        const fileMapKeys = Object.keys(fileMap);
        for (let i = 0; i < fileMapKeys.length; i++) {
            addUrl(title, fileMap[fileMapKeys[i]].url, `${date} ${title} ${fileMap[fileMapKeys[i]].name}.${fileMap[fileMapKeys[i]].extension}`);
        }
    } else {
        console.log(`不明なタイプ\n${postInfo.type}@${postInfo.id}`);
    }
    if (limit != null) limit--;
}

// URLリストに追加
function addUrl(title: string, url: string, fileName: string) {
    const dl = {url, fileName};
    dlList.fileCount++;
    if (!dlList.items[title]) dlList.items[title] = [];
    dlList.items[title].push(dl);
}

// ZIPでダウンロード
async function downloadZip(json: string) {
    // @ts-ignore
    await import("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.6.0/jszip.min.js");
    dlList = JSON.parse(json);
    // @ts-ignore
    let zip = new JSZip();
    let root = zip.folder(dlList.id);
    let count = 0;
    console.log(`@${dlList.id} 投稿:${dlList.postCount} ファイル:${dlList.fileCount}`);
    for (const [title, items] of Object.entries(dlList.items)) {
        let folder = root.folder(title);
        let i = 1, l = items.length;
        for (const dl of items) {
            console.log(`download ${dl.fileName} (${i++}/${l})`)
            const response = await fetch(dl.url);
            const blob = await response.blob();
            folder.file(dl.fileName, blob)
            await setTimeout(() => {
            }, 100);
        }
        count += l;
        console.log(`${count * 100 / dlList.fileCount | 0}% (${count}/${dlList.fileCount})`);
    }
    console.log("ZIPを作成");
    const blob = await zip.generateAsync({type: 'blob'});
    const url = URL.createObjectURL(blob);
    let a = document.createElement("a");
    a.href = url;
    a.download = `${dlList.id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await setTimeout(() => window.URL.revokeObjectURL(url), 100);
}
