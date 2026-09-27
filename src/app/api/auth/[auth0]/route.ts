import { handleAuth, handleLogin } from '@auth0/nextjs-auth0';
import { NextRequest } from 'next/server';

const authHandler = handleAuth({
  login: handleLogin({
    returnTo: '/',
  }),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ auth0: string }> }) {
  const params = await ctx.params;
  return authHandler(req, { params });
}
