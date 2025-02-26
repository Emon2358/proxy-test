// main.ts
addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// プロキシのトップページ用HTML
const htmlForm = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>プロキシサイト</title>
</head>
<body>
  <h1>プロキシサイト</h1>
  <p>プロキシ先のURLを入力してください：</p>
  <form method="get" action="/">
    <input type="text" name="target" placeholder="https://example.com" size="50" required>
    <button type="submit">送信</button>
  </form>
</body>
</html>`;

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const targetParam = url.searchParams.get("target");

  // プロキシ先が指定されていなければ、入力フォームを表示
  if (!targetParam) {
    return new Response(htmlForm, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 入力されたURLの形式チェック
  let baseTargetUrl: URL;
  try {
    baseTargetUrl = new URL(targetParam);
  } catch (error) {
    return new Response("無効なURLです。", { status: 400 });
  }

  // クライアントからのリクエストヘッダーを調整（Cloudflare等のブロック対策）
  const newHeaders = new Headers();
  for (const [key, value] of request.headers) {
    // セキュリティ系・オリジン系ヘッダーは削除
    if (
      key.toLowerCase().startsWith("sec-") ||
      key.toLowerCase() === "origin" ||
      key.toLowerCase() === "referer"
    ) {
      continue;
    }
    newHeaders.set(key, value);
  }
  // ブラウザらしいUser-Agentに上書き
  newHeaders.set(
    "User-Agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );
  // リファラーをターゲットサイトのオリジンに設定
  newHeaders.set("referer", baseTargetUrl.origin);

  // プロキシ先へのリクエストを生成
  const proxyRequest = new Request(baseTargetUrl.toString(), {
    method: request.method,
    headers: newHeaders,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? null
        : request.body,
    redirect: "manual", // 自動リダイレクトではなく、必要に応じて後続処理で対応
  });

  let response: Response;
  try {
    response = await fetch(proxyRequest);
  } catch (error) {
    return new Response(
      "対象URLの取得中にエラーが発生しました: " + error,
      { status: 500 }
    );
  }

  // HTMLの場合、レスポンス内容を書き換えてリンク等もプロキシ経由に変更
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    let text = await response.text();
    text = rewriteHTML(text, baseTargetUrl);

    // レスポンスヘッダーの中から、iframe埋め込みやコンテンツセキュリティの設定を削除（ブロック対策）
    const newResponseHeaders = new Headers(response.headers);
    newResponseHeaders.delete("content-security-policy");
    newResponseHeaders.delete("x-frame-options");

    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: newResponseHeaders,
    });
  } else {
    // HTML以外のコンテンツはそのまま返す
    return response;
  }
}

/**
 * HTML内のhref, src, action属性のURLを、すべてプロキシ経由でアクセスするよう書き換えます。
 * 相対パスは baseUrl を基準に解決します。
 */
function rewriteHTML(html: string, baseUrl: URL): string {
  return html.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, urlValue) => {
    // JavaScriptリンクやdataURI、ページ内アンカーはそのままにする
    if (
      urlValue.startsWith("javascript:") ||
      urlValue.startsWith("data:") ||
      urlValue.startsWith("#")
    ) {
      return match;
    }
    let resolvedUrl: URL;
    try {
      resolvedUrl = new URL(urlValue, baseUrl);
    } catch (error) {
      return match;
    }
    // プロキシ経由でアクセスするよう、targetパラメータに解決後のURLをセット
    return `${attr}="/?target=${encodeURIComponent(resolvedUrl.href)}"`;
  });
}
