import jwt from 'jsonwebtoken';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function signToken(user) {
  return jwt.sign(
    {
      id:       user.id,
      username: user.username,
      email:    user.email,
      avatar:   user.avatar,
      role:     user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
}


function setTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  });
}

export function handleGitHubCallback(req, res) {
  if (!req.user) {
    return res.redirect(`${CLIENT_URL}/login?error=oauth_failed`);
  }

  if (!process.env.JWT_SECRET) {
    return res.redirect(`${CLIENT_URL}/login?error=server_config`);
  }

  const token = signToken(req.user);
  setTokenCookie(res, token);

  return res.redirect(`${CLIENT_URL}/dashboard`);
}

export function getCurrentUser(req, res) {
  const token =
    req.cookies?.token ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.json({ data: null });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ data: decoded });
  } catch {
    res.clearCookie('token');
    return res.json({ data: null });
  }
}

export function logout(_req, res) {
  res.clearCookie('token');
  return res.json({ message: 'Logged out successfully.' });
}
