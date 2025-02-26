export async function fetch(request: Request): Promise<Response> {
  // 処理開始時刻の記録
  const startTime = performance.now();
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  if (!targetUrl) {
    return new Response("URLが指定されていません", { status: 400 });
  }

  try {
    // 入力されたサイトへ非同期アクセス
    const response = await fetch(targetUrl);
    const elapsed = performance.now() - startTime;
    // レスポンスの内容を arrayBuffer として取得（ストリーミングではなく一括読み込み）
    const body = await response.arrayBuffer();
    // レスポンスヘッダーを複製し、CORS 対応と経過時間を付与
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("X-Async-Time", `${elapsed.toFixed(2)}ms`);

    return new Response(body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (error) {
    const elapsed = performance.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      "フェッチエラー: " + message + ` (Elapsed: ${elapsed.toFixed(2)}ms)`,
      { status: 500 }
    );
  }
}
