// Wifegram portfolio PM2 ecosystem.
// Both processes carry max_restarts + min_uptime per Apr 30 disk-crisis guard.
// `npx serve` runs without -s SPA mode (per Hire ecosystem.config.js lesson).

module.exports = {
  apps: [
    {
      name: "wifegram-site",
      script: "npx",
      args: "serve . -l 3128",
      cwd: "/Users/nobanksnearby/Documents/wifegram-portfolio",
      max_restarts: 5,
      min_uptime: "30s",
      time: true,
      restart_delay: 2000,
    },
    {
      name: "wifegram-tunnel",
      script: "cloudflared",
      args: "tunnel --config /Users/nobanksnearby/.cloudflared/wifegram.yml run",
      max_restarts: 5,
      min_uptime: "30s",
      time: true,
      restart_delay: 2000,
    },
  ],
}
