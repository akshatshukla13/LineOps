import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';

const app = express();

const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '458009879224-ciuj4vh97871l06c0qp9gd811ga6c8ej.apps.googleusercontent.com';

const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/home', (req, res) => {
  res.json({ message: 'Welcome to the home endpoint' });
});

app.post('/auth/google', async (req, res) => {
  const { credential } = req.body || {};

  if (!credential) {
    return res.status(400).json({ error: 'Missing credential.' });
  }

  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    const user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      givenName: payload.given_name,
      familyName: payload.family_name,
      locale: payload.locale,
      emailVerified: payload.email_verified,
    };

    return res.json({ user });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
