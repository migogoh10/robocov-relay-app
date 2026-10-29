export default {
  async fetch(request, env, ctx) {
    const TARGET_URL = "https://your-hidden-destination-site.com";

    const url = new URL(request.url);
    const target = TARGET_URL + url.pathname + url.search;

    const modifiedRequest = new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual"
    });

    let response = await fetch(modifiedRequest);

    return new Response(response.body, response);
  },
};
