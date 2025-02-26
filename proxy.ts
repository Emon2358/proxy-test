// main.ts
addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("target");

  // URLが指定されていない場合は、HTMLフォームを返す（プロキシ先URLをユーザーが入力可能）
  if (!target) {
    const html = `
      <!DOCTYPE html>
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
      </html>
    `;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 入力されたURLの形式チェック
  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch (error) {
    return new Response("無効なURLです。", { status: 400 });
  }

  // クライアントからのリクエストをもとに、指定されたURLへリクエストを転送
  const proxyRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "follow",
  });

  try {
    const response = await fetch(proxyRequest);
    return response;
  } catch (error) {
    return new Response("対象URLの取得中にエラーが発生しました: " + error, { status: 500 });
  }
}
