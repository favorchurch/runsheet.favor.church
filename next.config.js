/* eslint-disable @typescript-eslint/no-var-requires */
const { entries } = require('lodash');

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    AUTH0_BASE_URL:
      process.env.VERCEL_URL && !process.env.AUTH0_BASE_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.AUTH0_BASE_URL,
  },
  reactStrictMode: false,
  experimental: {
    optimizePackageImports: [
      '@mui/material',
      '@mui/icons-material',
      'lodash',
      'react-icons'
    ]
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'info'] } : false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      /*
      {
        protocol: 'https',
        hostname: '**.vercel-storage.com', // Vercel blob host
      }
      */
    ],
  },
  // add security headers etc
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // security headers
          {
            key: 'Referrer-Policy',
            value: 'no-referrer-when-downgrade',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'sameorigin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex',
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self "https://*.favor.church"), microphone=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubdomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'self'; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://youtube.com https://calendar.google.com https://connectsignups.favor.church https://preview.connectsignups.favor.church https://connect-signups--preview.rico-favor.deno.net",
          },
        ],
      },
    ];
  },
};

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
