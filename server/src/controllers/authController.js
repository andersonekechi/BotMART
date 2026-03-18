const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

function generateToken(admin) {
  return jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(admin);
    res.json({
      token,
      admin: { id: admin._id, username: admin.username, role: admin.role },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.me = async (req, res) => {
  res.json({ admin: req.admin });
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin._id);

    if (!(await admin.comparePassword(currentPassword))) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }

    admin.password = newPassword;
    await admin.save();
    res.json({ message: 'Password updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
