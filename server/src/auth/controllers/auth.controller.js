import jwt from 'jsonwebtoken';

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

function buildAuthToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
}

export function handleGitHubCallback(req, res) {
  if (!req.user) {
    return res.redirect(`${clientUrl}/login`);
  }

  const token = buildAuthToken(req.user);

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.redirect(`${clientUrl}/home`);
}

export function getCurrentUser(req, res) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.json({ data: null });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ data: decoded });
  } catch (_error) {
    res.clearCookie('token');
    return res.json({ data: null });
  }
}

export function logout(req, res) {
  res.clearCookie('token');
  return res.json({ message: 'Logged out' });
}
