# fanbox-downloader
pixiv FANBOXの投稿を一括ダウンロード → 投稿毎にフォルダ分けして保存する

自分用、性欲駆動開発

### 使い方
1. ブックマークに追加する
2. FANBOXのクリエイターページか投稿ページで実行する
3. URLのリストがjsonでクリップボードに吐き出される
4. download.fanbox.ccでまた実行、jsonをコピペ
5. なんかダウンロードはじまる

### 既知の問題
- type: textに対応してない
- 画像とファイルだけじゃなくて文章も保存したいね
- ~~画像以外でファイル名の規則が適用されない~~

### fork後の変更点
- 対応するURLを少し増やした
- ダウンロードする投稿数が指定できるようになった
- 投稿毎にフォルダ分けしたZIPでダウンロードするよ（ZIP化する分少し時間がかかる←デメリット）
- コードが長くなったから外部から読み込むようにした

↓ブックマークレット
```
javascript:import("https://furubarug.github.io/fanbox-downloader/fanbox-downloader.min.js").then(m=>m.fanboxDownloader());
```
