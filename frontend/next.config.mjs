const backend = process.env.BACKEND_URL || "http://localhost:8049";

export default {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};
