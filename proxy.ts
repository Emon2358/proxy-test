import { serve } from "https://deno.land/std@0.170.0/http/server.ts";

/**
 * HTML内の href, src, action 属性を全て /proxy?url=～ 形式に書き換えます。
 * 相対パスの場合は、targetUrl を基準に絶対URLに変換します。
 */
function rewriteHtml(html: string, targetUrl: string): string {
  return html.replace(/(href|src|action)=["'](.*?)["']/gi, (match, attr, link) => {
    // data:, mailto:, アンカーリンクはそのままにする
    if (link.startsWith("data:") || link.startsWith("mailto:") || link.startsWith("#")) {
      return match;
    }
    let absoluteUrl: string;
    try {
      if (link.startsWith("http://") || link.startsWith("https://")) {
        absoluteUrl = link;
      } else if (link.startsWith("//")) {
        absoluteUrl = "https:" + link;
      } else {
        absoluteUrl = new URL(link, targetUrl).toString();
      }
    } catch (e) {
      absoluteUrl = link;
    }
    return `${attr}="/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
  });
}

/**
 * リダイレクト時の Location ヘッダーを書き換え、
 * 絶対URLに変換後、プロキシ経由のURLにします。
 */
function rewriteLocation(location: string, targetUrl: string): string {
  let absoluteUrl: string;
  try {
    absoluteUrl = new URL(location, targetUrl).toString();
  } catch (e) {
    absoluteUrl = location;
  }
  return "/proxy?url=" + encodeURIComponent(absoluteUrl);
}

/**
 * Set-Cookie ヘッダー内の Domain 属性を除去し、
 * クライアント側でプロキシドメインのCookieとして扱えるようにする。
 */
function rewriteSetCookie(cookie: string): string {
  return cookie.replace(/;?\s*Domain=[^;]+/i, "");
}

serve(async (req: Request) => {
  const url = new URL(req.url);

  // CORS用のプリフライトリクエスト対応
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // トップページ：URL入力フォームを表示 (GET "/")
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
  }

  // /proxy エンドポイント：リバースプロキシ処理
  if (url.pathname === "/proxy") {
    // クエリパラメータから対象のURLを取得
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response("URLが指定されていません", { status: 400 });
    }

    // GET/POSTなど、リクエストメソッドとボディを転送
    let body: BodyInit | undefined = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        body = await req.arrayBuffer();
      } catch (e) {
        // ボディ取得に失敗した場合は空として扱う
      }
    }

    // クライアントからのヘッダーを転送（Host, Originは除去）
    const reqHeaders = new Headers(req.headers);
    reqHeaders.delete("host");
    reqHeaders.delete("origin");

    const requestInit: RequestInit = {
      method: req.method,
      headers: reqHeaders,
      body,
      redirect: "manual", // リダイレクトを自動処理せず手動で対応
    };

    let response: Response;
    try {
      response = await fetch(targetUrl, requestInit);
    } catch (error) {
      return new Response("プロキシエラー: " + error.message, { status: 500 });
    }

    // レスポンスヘッダーをコピーし、CORS対応ヘッダーを追加
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");

    // ターゲットから送られてきた Set-Cookie ヘッダーを書き換え
    const cookieHeaders: string[] = [];
    for (const [key, value] of response.headers) {
      if (key.toLowerCase() === "set-cookie") {
        cookieHeaders.push(value);
      }
    }
    newHeaders.delete("set-cookie");
    for (const cookie of cookieHeaders) {
      newHeaders.append("set-cookie", rewriteSetCookie(cookie));
    }

    // リダイレクト処理：3xx の場合、Location ヘッダーを書き換える
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("location");
      if (loc) {
        newHeaders.set("location", rewriteLocation(loc, targetUrl));
      }
      return new Response(null, { status: response.status, headers: newHeaders });
    }

    // HTMLコンテンツの場合、内部のリンクやフォームのURLを書き換える
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      let htmlText = await response.text();
      htmlText = rewriteHtml(htmlText, targetUrl);
      // <head>タグ直後に<base>タグを挿入して、相対URLがプロキシ経由で解決されるようにする
      htmlText = htmlText.replace(/<head([^>]*)>/i, `<head$1><base href="/proxy?url=${encodeURIComponent(targetUrl)}/">`);
      return new Response(htmlText, { status: response.status, headers: newHeaders });
    } else {
      // HTML以外（CSS, JS, 画像など）はそのまま転送
      const bodyData = await response.arrayBuffer();
      return new Response(bodyData, { status: response.status, headers: newHeaders });
    }
  }

  return new Response("Not Found", { status: 404 });
});
