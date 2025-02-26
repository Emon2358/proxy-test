import { serve } from "https://deno.land/std@0.170.0/http/server.ts";

serve(async (req: Request) => {
  const url = new URL(req.url);
  
  // トップページ：URL入力フォームを表示
  if (url.pathname === "/" && req.method === "GET") {
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Reverse Proxy</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    input[type="text"] { width: 300px; padding: 8px; }
    button { padding: 8px 12px; }
  </style>
</head>
<body>
  <h1>Reverse Proxy</h1>
  <form action="/proxy" method="GET">
    <label for="url">URL:</label>
    <input type="text" id="url" name="url" placeholder="https://example.com" required>
    <button type="submit">アクセス</button>
  </form>
</body>
</html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  
  // /proxyエンドポイント：指定URLのコンテンツを取得して返す
  } else if (url.pathname === "/proxy" && req.method === "GET") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response("URLが指定されていません", { status: 400 });
    }
    try {
      const response = await fetch(targetUrl);
      const contentType = response.headers.get("content-type") || "";
      
      // HTMLの場合は、<head>タグ内に<base>タグを挿入し、
      // 相対URLが元のサイトを基準に解決されるようにする
      if (contentType.includes("text/html")) {
        let htmlText = await response.text();
        htmlText = htmlText.replace(/<head([^>]*)>/i, `<head$1><base href="${targetUrl}">`);
        return new Response(htmlText, {
          status: response.status,
          headers: { "Content-Type": contentType },
        });
      } else {
        // HTML以外のコンテンツはそのまま返す
        const body = await response.arrayBuffer();
        return new Response(body, {
          status: response.status,
          headers: { "Content-Type": contentType },
        });
      }
    } catch (error) {
      return new Response("プロキシエラー: " + error.message, { status: 500 });
    }
  } else {
    return new Response("Not Found", { status: 404 });
  }
});
