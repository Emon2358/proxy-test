addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// プロキシのトップページ用HTML
const htmlForm = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>出張版texttyoBB</title>
  <style>
    body {
      background-image: url('https://f4.bcbits.com/img/0011628734_100.png');
      background-size: cover;
      background-position: center;
      color: white;
      text-align: center;
      font-family: Arial, sans-serif;
      padding-top: 50px;
    }
    input, button {
      padding: 10px;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <h1>出張版texttyoBB</h1>
  <p>プロキシ先のURLを入力してください：</p>
  <form method="get" action="/">
    <input type="text" name="target" placeholder="https://example.com" size="50" required>
    <button type="submit">送信</button>
  </form>
</body>
</html>`;

async function handleRequest(request) {
  const url = new URL(request.url);
  const targetParam = url.searchParams.get("target");

  if (!targetParam) {
    return new Response(htmlForm, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let baseTargetUrl;
  try {
    baseTargetUrl = new URL(targetParam);
  } catch (error) {
    return new Response("無効なURLです。", { status: 400 });
  }

  const newHeaders = new Headers();
  for (const [key, value] of request.headers) {
    if (key.toLowerCase().startsWith("sec-") || key.toLowerCase() === "origin" || key.toLowerCase() === "referer") {
      continue;
    }
    newHeaders.set(key, value);
  }
  newHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
  newHeaders.set("referer", baseTargetUrl.origin);

  const proxyRequest = new Request(baseTargetUrl.toString(), {
    method: request.method,
    headers: newHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
    redirect: "manual",
  });

  let response;
  try {
    response = await fetch(proxyRequest);
  } catch (error) {
    return new Response("対象URLの取得中にエラーが発生しました: " + error, { status: 500 });
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    let text = await response.text();
    text = rewriteHTML(text, baseTargetUrl);

    const newResponseHeaders = new Headers(response.headers);
    newResponseHeaders.delete("content-security-policy");
    newResponseHeaders.delete("x-frame-options");

    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: newResponseHeaders,
    });
  } else {
    return response;
  }
}

function rewriteHTML(html, baseUrl) {
  return html.replace(/(href|src|action)=\"([^\"]+)\"/gi, (match, attr, urlValue) => {
    if (urlValue.startsWith("javascript:") || urlValue.startsWith("data:") || urlValue.startsWith("#")) {
      return match;
    }
    let resolvedUrl;
    try {
      resolvedUrl = new URL(urlValue, baseUrl);
    } catch (error) {
      return match;
    }
    return `${attr}="/?target=${encodeURIComponent(resolvedUrl.href)}"`;
  });
}
