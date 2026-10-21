/** @type {import('next').NextConfig} */
// Security headers. The CSP lists only what the app loads: Supabase (data, storage, realtime), Razorpay Checkout,
// Google Places, OneSignal and Google Fonts. Next.js needs inline scripts and styles without nonces.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "*.supabase.co";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://maps.googleapis.com https://cdn.onesignal.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://${supabase} https://maps.gstatic.com https://maps.googleapis.com https://*.razorpay.com`,
  `media-src 'self' blob: data: https://${supabase}`,
  `connect-src 'self' https://${supabase} wss://${supabase} https://api.razorpay.com https://lumberjack.razorpay.com https://maps.googleapis.com https://places.googleapis.com https://*.onesignal.com`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self \"https://api.razorpay.com\"), interest-cohort=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      ],
    }];
  },
};
export default nextConfig;
