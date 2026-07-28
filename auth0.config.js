import { auth } from '@auth0/nextjs-auth0';

export default auth({
  session: {
    rolling: false,
    absoluteTimeout: 60 * 60 * 24,
  }
});
