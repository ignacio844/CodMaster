import MatchDashboard from './match-dashboard';
import { getGoogleUser } from '../lib/google-auth';
import GoogleSignIn from './google-sign-in';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getGoogleUser();
  if (!user) return <GoogleSignIn clientId={process.env.GOOGLE_CLIENT_ID ?? null} />;
  return <MatchDashboard />;
}
