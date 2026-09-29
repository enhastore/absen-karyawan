const express = require('express');
const router = express.Router();
const { dbHelper } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const aiTelegramService = require('../services/aiTelegramService');

// Mask sensitive keys for security (100% hidden when saved)
function maskKey(key) {
  if (!key || typeof key !== 'string') return '';
  return '••••••••••••••••••••';
}

// GET /api/ai/config - Get all AI & Telegram configurations
router.get('/config', authenticateToken, requireAdmin, (req, res) => {
  try {
    const rawSettings = aiTelegramService.getSettings();

    const config = {
      gemini_api_key_masked: maskKey(rawSettings.gemini_api_key),
      has_gemini_key: Boolean(rawSettings.gemini_api_key),
      gemini_model: rawSettings.gemini_model || 'gemini-1.5-flash',

      telegram_bot_token_masked: maskKey(rawSettings.telegram_bot_token),
      has_telegram_token: Boolean(rawSettings.telegram_bot_token),
      telegram_bot_username: rawSettings.telegram_bot_username || '',
      telegram_admin_chat_id: rawSettings.telegram_admin_chat_id || '',

      ai_auto_reminder_in: rawSettings.ai_auto_reminder_in === 'true' || rawSettings.ai_auto_reminder_in === '1',
      ai_auto_reminder_out: rawSettings.ai_auto_reminder_out === 'true' || rawSettings.ai_auto_reminder_out === '1',
      ai_auto_reminder_tasks: rawSettings.ai_auto_reminder_tasks === 'true' || rawSettings.ai_auto_reminder_tasks === '1',
      ai_daily_report: rawSettings.ai_daily_report === 'true' || rawSettings.ai_daily_report === '1',
      ai_daily_report_time: rawSettings.ai_daily_report_time || '17:30',

      polling_active: aiTelegramService.pollingActive,
    };

    res.json({ config });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat mengambil konfigurasi AI.' });
  }
});

// PUT /api/ai/config - Save AI & Telegram configurations
router.put('/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      gemini_api_key,
      gemini_model,
      telegram_bot_token,
      telegram_admin_chat_id,
      ai_auto_reminder_in,
      ai_auto_reminder_out,
      ai_auto_reminder_tasks,
      ai_daily_report,
      ai_daily_report_time,
      start_polling
    } = req.body;

    const currentSettings = aiTelegramService.getSettings();

    // Helper to upsert setting
    const setSetting = (k, v) => {
      const existing = dbHelper.prepare('SELECT key FROM settings WHERE key = ?').get(k);
      if (existing) {
        dbHelper.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(String(v), k);
      } else {
        dbHelper.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, String(v));
      }
    };

    // Update Gemini
    if (gemini_api_key !== undefined && !gemini_api_key.startsWith('••••')) {
      setSetting('gemini_api_key', gemini_api_key.trim());
    }
    if (gemini_model !== undefined) {
      setSetting('gemini_model', gemini_model);
    }

    // Update Telegram Bot Token
    let botInfo = null;
    let tokenToUse = currentSettings.telegram_bot_token;
    if (telegram_bot_token !== undefined && !telegram_bot_token.startsWith('••••')) {
      tokenToUse = telegram_bot_token.trim();
      setSetting('telegram_bot_token', tokenToUse);

      if (tokenToUse) {
        try {
          botInfo = await aiTelegramService.getBotMe(tokenToUse);
          if (botInfo && botInfo.username) {
            setSetting('telegram_bot_username', '@' + botInfo.username);
          }
        } catch (e) {
          console.warn('Verifikasi bot token menghasilkan peringatan:', e.message);
        }
      }
    }

    if (telegram_admin_chat_id !== undefined) setSetting('telegram_admin_chat_id', telegram_admin_chat_id.trim());
    if (ai_auto_reminder_in !== undefined) setSetting('ai_auto_reminder_in', ai_auto_reminder_in ? '1' : '0');
    if (ai_auto_reminder_out !== undefined) setSetting('ai_auto_reminder_out', ai_auto_reminder_out ? '1' : '0');
    if (ai_auto_reminder_tasks !== undefined) setSetting('ai_auto_reminder_tasks', ai_auto_reminder_tasks ? '1' : '0');
    if (ai_daily_report !== undefined) setSetting('ai_daily_report', ai_daily_report ? '1' : '0');
    if (ai_daily_report_time !== undefined) setSetting('ai_daily_report_time', ai_daily_report_time);

    // Handle Polling State
    if (start_polling !== undefined) {
      if (start_polling && tokenToUse) {
        aiTelegramService.startPolling();
      } else if (!start_polling) {
        aiTelegramService.stopPolling();
      }
    } else if (tokenToUse && !aiTelegramService.pollingActive) {
      aiTelegramService.startPolling();
    }

    res.json({
      message: 'Konfigurasi Asisten AI & Bot Telegram berhasil disimpan.',
      bot_username: botInfo ? '@' + botInfo.username : currentSettings.telegram_bot_username
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyimpan konfigurasi: ' + err.message });
  }
});

// POST /api/ai/test-gemini - Test Gemini AI API
router.post('/test-gemini', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { key, model } = req.body;
    let apiKey = key;
    if (!apiKey || apiKey.startsWith('••••')) {
      const settings = aiTelegramService.getSettings();
      apiKey = settings.gemini_api_key;
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'API Key Gemini belum diisi.' });
    }

    const testPrompt = 'Berikan 1 kalimat salam pembuka yang ramah dan inspiratif dalam Bahasa Indonesia untuk tim toko produk digital AbsenKu.';
    
    // Modern candidate models with priority on fast and high-availability models
    const candidates = [];
    if (model && model !== 'gemini-1.5-flash' && model !== 'gemini-2.5-flash') {
      candidates.push(model);
    }
    candidates.push('gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest');
    const modelsToTry = [...new Set(candidates)];

    let lastError = '';
    let successfulReply = null;
    let workingModel = null;

    for (const m of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: testPrompt }] }] })
        });

        if (resp.ok) {
          const data = await resp.json();
          successfulReply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Terhubung dengan sukses!';
          workingModel = m;
          break;
        } else {
          const errText = await resp.text();
          let msg = errText;
          try {
            const p = JSON.parse(errText);
            if (p.error?.message) msg = p.error.message;
          } catch (_) {}
          lastError = msg;
        }
      } catch (netErr) {
        lastError = netErr.message;
      }
    }

    if (!successfulReply) {
      return res.status(400).json({ error: 'Gemini API menolak permintaan: ' + lastError });
    }

    // Persist working model
    try {
      dbHelper.prepare("INSERT OR REPLACE INTO settings (key, value, description) VALUES ('gemini_model', ?, 'Model Gemini AI')").run(workingModel);
    } catch (_) {}

    res.json({ message: 'Koneksi Gemini AI Berhasil!', model: workingModel, reply: successfulReply });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menguji Gemini: ' + err.message });
  }
});

// POST /api/ai/test-telegram - Test Telegram Bot Token
router.post('/test-telegram', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { token, chat_id } = req.body;
    let botToken = token;
    if (!botToken || botToken.startsWith('••••')) {
      const settings = aiTelegramService.getSettings();
      botToken = settings.telegram_bot_token;
    }

    if (!botToken) {
      return res.status(400).json({ error: 'Token Bot Telegram belum diisi.' });
    }

    const botInfo = await aiTelegramService.getBotMe(botToken);

    // If chat_id is provided, send a test ping
    let messageSent = false;
    if (chat_id) {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat_id,
          text: `🔔 <b>Uji Pesan Bot Telegram Berhasil!</b>\nBot <b>@${botInfo.username}</b> telah terhubung dengan sistem <b>AbsenKu</b>!`,
          parse_mode: 'HTML'
        })
      });
      const data = await resp.json();
      if (data.ok) messageSent = true;
    }

    res.json({
      message: `Bot Telegram @${botInfo.username} berhasil terverifikasi!`,
      bot: botInfo,
      message_sent: messageSent
    });
  } catch (err) {
    res.status(400).json({ error: 'Uji Telegram gagal: ' + err.message });
  }
});

// POST /api/ai/broadcast - Trigger manual notifications & reports
router.post('/broadcast', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type } = req.body; // 'attendance', 'tasks', 'daily_report'

    if (type === 'attendance') {
      const result = await aiTelegramService.sendAttendanceReminders();
      return res.json({
        message: `Peringatan presensi berhasil dikirim ke ${result.sentCount} karyawan dari ${result.targetCount} karyawan yang belum absen.`
      });
    }

    if (type === 'tasks') {
      const result = await aiTelegramService.sendTaskReminders();
      return res.json({
        message: `Pengingat tugas aktif berhasil dikirim ke ${result.sentCount} karyawan terhubung.`
      });
    }

    if (type === 'daily_report') {
      const result = await aiTelegramService.sendDailyReportToAdmin();
      return res.json({ message: result.message });
    }

    res.status(400).json({ error: 'Tipe broadcast tidak valid.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengirim pesan: ' + err.message });
  }
});

// GET /api/ai/employees - Get employee pairing status
router.get('/employees', authenticateToken, requireAdmin, (req, res) => {
  try {
    const employees = dbHelper.prepare(`
      SELECT u.id, u.employee_id, u.name, u.email, u.position, u.phone,
             u.telegram_chat_id, u.telegram_username, d.name as department_name,
             CASE WHEN u.telegram_chat_id IS NOT NULL AND u.telegram_chat_id != '' THEN 1 ELSE 0 END as is_connected
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.is_active = 1 AND u.role != 'admin'
      ORDER BY u.name ASC
    `).all();

    res.json({ employees });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// PUT /api/ai/employees/:id/telegram - Pair or unpair employee manually
router.put('/employees/:id/telegram', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { telegram_chat_id, telegram_username } = req.body;

    const emp = dbHelper.prepare('SELECT id, name FROM users WHERE id = ?').get(id);
    if (!emp) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

    dbHelper.prepare('UPDATE users SET telegram_chat_id = ?, telegram_username = ? WHERE id = ?')
      .run(telegram_chat_id || null, telegram_username || null, id);

    aiTelegramService.logActivity('pairing', id, emp.name, `Admin mengubah data Telegram karyawan (${telegram_chat_id || 'Terputus'}).`);

    res.json({ message: `Data Telegram karyawan "${emp.name}" berhasil diperbarui.` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui data: ' + err.message });
  }
});

// GET /api/ai/logs - Get recent bot logs
router.get('/logs', authenticateToken, requireAdmin, (req, res) => {
  try {
    const logs = dbHelper.prepare(`
      SELECT * FROM bot_logs
      ORDER BY created_at DESC
      LIMIT 40
    `).all();

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// POST /api/ai/simulate-message - Simulator for Admin Testing without live webhook
router.post('/simulate-message', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, message_text } = req.body;
    const user = dbHelper.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

    // Mock incoming Telegram message
    const mockChatId = user.telegram_chat_id || ('sim_' + user.id);
    const mockMsg = {
      chat: { id: mockChatId },
      from: {
        first_name: user.name.split(' ')[0],
        last_name: user.name.split(' ').slice(1).join(' '),
        username: user.telegram_username || ('user_' + user.id)
      },
      text: message_text
    };

    // Intercept outbound sendMessage temporarily to capture output
    const originalSendMessage = aiTelegramService.sendMessage.bind(aiTelegramService);
    let capturedReply = '';

    aiTelegramService.sendMessage = async (cId, text) => {
      capturedReply = text;
      return { ok: true, result: { message_id: 1 } };
    };

    try {
      await aiTelegramService.handleIncomingMessage(mockMsg);
    } finally {
      aiTelegramService.sendMessage = originalSendMessage;
    }

    res.json({
      success: true,
      sent_message: message_text,
      bot_reply: capturedReply || 'Perintah diproses.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Simulasi gagal: ' + err.message });
  }
});

module.exports = router;
