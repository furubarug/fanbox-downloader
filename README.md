# fanbox-downloader
pixiv FANBOXの投稿を投稿毎にフォルダ分け → ZIPとして一括ダウンロードするブックマークレット

自分用、性欲駆動開発

※親元のブランチの更新が途絶えているため個人的に利用するために作成。Claude等で保守する想定のため確度は不明

### 使い方
- https://novel0917.github.io/fanbox-downloader/

↓ブックマークレット
```
javascript:import("https://novel0917.github.io/fanbox-downloader/fanbox-downloader.min.js").then(m=>m.main()).catch(e=>alert(`エラー出た(${e})`));
```

### 既知の問題
- 4GB超えるとZIP解凍時にエラーが出る（解凍ファイルに問題はないけど、うるさいツールだと解凍してくれないかも）
- ファイル表示のリンクで`download`属性が機能してない（ファイル名重複時に元ファイル名に戻せない）

### fork後の変更点
- 対応するURLを少し増やした
- 投稿毎にフォルダ分けしたZIPでダウンロードするよ
- 投稿の文章とかの情報もそれっぽく保存
- コードが長くなったから外部から読み込むようにした

### 開発用TIPS

- tsコンパイル

```bash
# yarn run build
npm run build
```
