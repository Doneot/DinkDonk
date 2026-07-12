export async function getNgrokUrl(): Promise<string> {
  while (true) {
    try {
      const res = await fetch(
        "http://ngrok:4040/api/tunnels",
      );

      const data = (await res.json()) as {
        tunnels?: Array<{
          proto: string;
          public_url: string;
        }>;
      };

      const url = data.tunnels?.find(
        (t) => t.proto === "https",
      )?.public_url;

      if (url) {
        return url;
      }
    } catch {
      // ngrok not ready
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1000),
    );
  }
}