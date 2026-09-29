const fs = require('fs');
const path = require('path');
const { dbHelper } = require('../config/database');

class AITelegramService {
  constructor() {
    this.pollingActive = false;
    this.lastUpdateId = 0;
    this.pollTimer = null;
    this.cronTimer = null;
    this.isFetchingUpdates = false;
  }

  // Load all settings as an object
  getSettings() {
    try {
      const rows = dbHelper.prepare('SELECT key, value FROM settings').all();
      const map = {};
      rows.forEach(r => { map[r.key] = r.value; });
      return map;
    } catch (e) {
      console.error('Error fetching settings:', e.message);
      return {};
    }
  }

  // Helper to log bot and AI activities
  logActivity(type, targetUserId, targetName, message, status = 'success') {
    try {
      dbHelper.prepare(`
        INSERT INTO bot_logs (type, target_user_id, target_name, message, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(type, targetUserId || null, targetName || null, message, status);
    } catch (e) {
      console.error('Failed to log bot activity:', e.message);
    }
  }

  // ========== GOOGLE GEMINI AI INTEGRATION ==========

  async askGemini(prompt, systemInstruction = '') {
    const settings = this.getSettings();
    const apiKey = settings.gemini_api_key;
    const configuredModel = settings.gemini_model;

    if (!apiKey) {
      throw new Error('API Key Google Gemini belum diatur di menu Asisten AI.');
    }

    const candidates = [];
    if (configuredModel && configuredModel !== 'gemini-1.5-flash' && configuredModel !== 'gemini-2.5-flash') {
      candidates.push(configuredModel);
    }
    candidates.push('gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest');
    const modelsToTry = [...new Set(candidates)];

    const contents = [];
    if (systemInstruction) {
      contents.push({
        role: 'user',
        parts: [{ text: `[INSTRUKSI SISTEM]: ${systemInstruction}\n\n[PESAN PENGGUNA]: ${prompt}` }]
      });
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: prompt }]
      });
    }

    let lastError = 'Gagal menghubungi Gemini API';
    for (const m of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents })
        });

        if (response.ok) {
          const data = await response.json();
          const candidate = data.candidates && data.candidates[0];
          if (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0]) {
            return candidate.content.parts[0].text;
          }
          return 'Maaf, Gemini AI tidak memberikan respons teks.';
        } else {
          const errText = await response.text();
          try {
            const parsed = JSON.parse(errText);
            if (parsed.error && parsed.error.message) lastError = parsed.error.message;
          } catch (_) {}
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    throw new Error(`Gemini Error: ${lastError}`);
  }

  // Analyze selfie image using Gemini Vision
  async analyzeSelfieWithGemini(imageBuffer, mimeType = 'image/jpeg') {
    const settings = this.getSettings();
    const apiKey = settings.gemini_api_key;
    const configuredModel = settings.gemini_model;

    if (!apiKey) {
      return { verified: true, note: 'Foto selfie diterima (Verifikasi AI Gemini tidak aktif).' };
    }

    const candidates = [];
    if (configuredModel && configuredModel !== 'gemini-1.5-flash' && configuredModel !== 'gemini-2.5-flash') {
      candidates.push(configuredModel);
    }
    candidates.push('gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest');
    const modelsToTry = [...new Set(candidates)];

    try {
      const base64Data = imageBuffer.toString('base64');
      const body = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Periksa foto ini. Ini adalah foto selfie presensi kehadiran karyawan toko digital (DigiStore). Berikan catatan evaluasi singkat (1 kalimat ramah, maks 20 kata, bahasa Indonesia) yang mengonfirmasi kehadiran karyawan dengan semangat kerja positif.'
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      };

      for (const m of modelsToTry) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return { verified: true, note: text ? text.trim() : 'Foto selfie berhasil terverifikasi.' };
          }
        } catch (_) {}
      }

      return { verified: true, note: 'Foto selfie berhasil diterima dan disimpan.' };
    } catch (e) {
      console.warn('Gemini selfie analysis error:', e.message);
      return { verified: true, note: 'Foto selfie berhasil disimpan.' };
    }
  }

  // ========== TELEGRAM BOT API INTEGRATION ==========

  async callTelegram(method, payload = {}) {
    const settings = this.getSettings();
    const token = settings.telegram_bot_token;
    if (!token) throw new Error('Token Bot Telegram belum diatur di menu Asisten AI.');

    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram API Error: ${data.description || 'Unknown error'}`);
    }
    return data.result;
  }

  // Get info about bot
  async getBotMe(tokenOverride = null) {
    const settings = this.getSettings();
    const token = tokenOverride || settings.telegram_bot_token;
    if (!token) throw new Error('Token Bot Telegram belum diisi.');

    const url = `https://api.telegram.org/bot${token}/getMe`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.description || 'Gagal memverifikasi token Telegram.');
    }
    return data.result;
  }

  // Send message to Telegram chat
  async sendMessage(chatId, text, extra = {}) {
    return this.callTelegram('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      ...extra
    });
  }

  // Download Telegram photo by file_id
  async downloadTelegramPhoto(fileId) {
    const settings = this.getSettings();
    const token = settings.telegram_bot_token;
    if (!token) throw new Error('Bot token tidak tersedia');

    // 1. Get file path
    const fileInfo = await this.callTelegram('getFile', { file_id: fileId });
    const filePath = fileInfo.file_path;

    // 2. Download file content
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error('Gagal mengunduh foto dari server Telegram');

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Save to uploads/attendance
    const uploadDir = path.join(__dirname, '..', 'uploads', 'attendance');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `selfie_tg_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
    const fullPath = path.join(uploadDir, filename);
    fs.writeFileSync(fullPath, buffer);

    return {
      relativePath: `/uploads/attendance/${filename}`,
      buffer: buffer,
      filename: filename
    };
  }

  // ========== MESSAGE HANDLING & CHAT BOT ATTENDANCE ==========

  async handleIncomingMessage(msg) {
    if (!msg || !msg.chat) return;

    const chatId = String(msg.chat.id);
    const tgUsername = msg.from.username || '';
    const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || 'Pengguna';
    const text = (msg.text || msg.caption || '').trim();
    const photos = msg.photo;

    // Find employee by telegram_chat_id
    let user = dbHelper.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(chatId);

    // If not found by chat_id, check if they are pairing via /start <code/email>
    if (!user) {
      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        const code = parts[1] ? parts[1].trim() : '';

        if (code) {
          // Find user by employee_id or email
          const matched = dbHelper.prepare(`
            SELECT * FROM users
            WHERE employee_id = ? OR email = ? OR LOWER(employee_id) = ?
          `).get(code, code, code.toLowerCase());

          if (matched) {
            dbHelper.prepare('UPDATE users SET telegram_chat_id = ?, telegram_username = ? WHERE id = ?')
              .run(chatId, tgUsername || null, matched.id);

            this.logActivity('pairing', matched.id, matched.name, `Akun Telegram @${tgUsername || chatId} berhasil dihubungkan ke ${matched.name}.`);

            await this.sendMessage(chatId, `
🎉 <b>Akun Berhasil Dihubungkan!</b>

Halo <b>${matched.name}</b> (${matched.position || 'Staf'}), akun Telegram Anda telah terverifikasi di sistem <b>AbsenKu</b>!

📌 <b>Perintah yang bisa Anda gunakan:</b>
📸 <b>Kirim Foto Selfie:</b> Langsung catat presensi Masuk / Pulang
📋 <code>/tugas</code> : Lihat daftar tugas Anda hari ini
✅ <code>/selesai &lt;ID&gt;</code> : Tandai tugas telah selesai
ℹ️ <code>/status</code> : Cek status absensi hari ini
❓ Kirim pesan apapun untuk berkonsultasi dengan Asisten AI!
            `.trim());
            return;
          } else {
            await this.sendMessage(chatId, `❌ ID Karyawan atau email <code>${code}</code> tidak ditemukan di sistem AbsenKu. Silakan periksa kembali atau hubungi admin.`);
            return;
          }
        }
      }

      // Check if user simply sent their email or employee_id
      if (text && !photos && !text.startsWith('/')) {
        const matched = dbHelper.prepare(`
          SELECT * FROM users
          WHERE (employee_id = ? OR email = ? OR LOWER(employee_id) = ?) AND (telegram_chat_id IS NULL OR telegram_chat_id = '')
        `).get(text, text, text.toLowerCase());

        if (matched) {
          dbHelper.prepare('UPDATE users SET telegram_chat_id = ?, telegram_username = ? WHERE id = ?')
            .run(chatId, tgUsername || null, matched.id);

          this.logActivity('pairing', matched.id, matched.name, `Akun Telegram @${tgUsername || chatId} berhasil dihubungkan.`);

          await this.sendMessage(chatId, `
🎉 <b>Akun Terverifikasi!</b>

Halo <b>${matched.name}</b>! Akun Anda berhasil terhubung dengan sistem presensi.
Kirimkan <b>foto selfie</b> Anda sekarang untuk mencatat presensi masuk!
          `.trim());
          return;
        }
      }

      // If still not paired
      await this.sendMessage(chatId, `
👋 <b>Halo, ${senderName}!</b>

Akun Telegram Anda belum terhubung dengan data karyawan <b>AbsenKu</b>.
Silakan hubungkan akun dengan mengetik:

<code>/start [ID_KARYAWAN]</code>
<i>Contoh:</i> <code>/start EMP001</code>

Atau ketik langsung alamat email yang terdaftar pada akun Anda.
      `.trim());
      return;
    }

    // USER IS PAIRED! Update telegram_username if changed
    if (tgUsername && user.telegram_username !== tgUsername) {
      dbHelper.prepare('UPDATE users SET telegram_username = ? WHERE id = ?').run(tgUsername, user.id);
    }

    // 1. HANDLE PHOTO (SELFIE KEHADIRAN)
    if (photos && photos.length > 0) {
      await this.processSelfieAttendance(user, chatId, photos, text);
      return;
    }

    // 2. HANDLE COMMANDS
    const cmd = text.toLowerCase().split(' ')[0];

    if (cmd === '/start' || cmd === '/help' || cmd === '/bantuan') {
      await this.sendMessage(chatId, `
🤖 <b>Asisten AI AbsenKu</b>

Halo <b>${user.name}</b> (${user.position || 'Staf'})!
Berikut fitur presensi dan tugas digital yang bisa Anda gunakan:

📸 <b>Kirim Foto Selfie</b> — Catat absensi Masuk atau Pulang secara instan
📋 <code>/tugas</code> — Lihat daftar tugas jobdesk Anda
✅ <code>/selesai &lt;ID&gt;</code> — Tandai tugas selesai (Contoh: <code>/selesai 2</code>)
ℹ️ <code>/status</code> — Cek ringkasan jam kerja hari ini
❓ Ketik pertanyaan apapun mengenai tugas atau aturan toko untuk dijawab oleh Asisten AI.
      `.trim());
      return;
    }

    if (cmd === '/masuk' || cmd === '/absen_masuk') {
      const settings = this.getSettings();
      if (settings.require_photo === 'true') {
        await this.sendMessage(chatId, `📸 <b>Absensi Masuk Memerlukan Selfie:</b>\nSilakan langsung ambil dan kirimkan <b>foto selfie</b> Anda di chat ini untuk mencatat presensi masuk.`);
      } else {
        await this.recordClockInWithoutPhoto(user, chatId, text);
      }
      return;
    }

    if (cmd === '/pulang' || cmd === '/absen_pulang') {
      await this.recordClockOutWithoutPhoto(user, chatId, text);
      return;
    }

    if (cmd === '/status') {
      await this.sendStatusSummary(user, chatId);
      return;
    }

    if (cmd === '/tugas' || cmd === '/tasks') {
      await this.sendTaskList(user, chatId);
      return;
    }

    if (cmd === '/selesai') {
      const parts = text.split(' ');
      const rawId = parts[1] ? parts[1].replace('#', '').trim() : '';
      const taskId = parseInt(rawId);

      if (!taskId) {
        await this.sendMessage(chatId, `⚠️ Format salah. Gunakan: <code>/selesai [ID_TUGAS]</code>\nContoh: <code>/selesai 5</code>\nKetik <code>/tugas</code> untuk melihat daftar ID tugas.`);
        return;
      }

      await this.completeTaskViaBot(user, chatId, taskId);
      return;
    }

    // 3. GENERAL TEXT -> CONSULT GEMINI AI
    await this.answerWithGemini(user, chatId, text);
  }

  // Process selfie attendance
  async processSelfieAttendance(user, chatId, photos, caption) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);

    try {
      // 1. Download photo
      const bestPhoto = photos[photos.length - 1];
      const downloaded = await this.downloadTelegramPhoto(bestPhoto.file_id);

      // 2. Check existing record
      const existing = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(user.id, today);

      if (!existing || !existing.clock_in) {
        // === CLOCK IN ===
        let aiNote = '';
        try {
          const aiResult = await this.analyzeSelfieWithGemini(downloaded.buffer);
          aiNote = aiResult.note;
        } catch (_) {}

        const settings = this.getSettings();
        const startTime = settings.work_start || '08:00';
        const toleranceMin = parseInt(settings.late_tolerance || '15');

        let status = 'present';
        const [startH, startM] = startTime.split(':').map(Number);
        const [curH, curM] = currentTime.split(':').map(Number);
        if (curH * 60 + curM > startH * 60 + startM + toleranceMin) {
          status = 'late';
        }

        if (existing) {
          dbHelper.prepare('UPDATE attendance SET clock_in = ?, clock_in_photo = ?, status = ?, notes = ? WHERE id = ?')
            .run(currentTime, downloaded.relativePath, status, caption || 'Absen via Telegram Bot (Selfie)', existing.id);
        } else {
          dbHelper.prepare('INSERT INTO attendance (user_id, date, clock_in, clock_in_photo, status, notes) VALUES (?, ?, ?, ?, ?, ?)')
            .run(user.id, today, currentTime, downloaded.relativePath, status, caption || 'Absen via Telegram Bot (Selfie)');
        }

        this.logActivity('attendance', user.id, user.name, `Presensi Masuk via Bot (${status === 'late' ? 'Terlambat' : 'Tepat Waktu'}, ${currentTime}).`);

        await this.sendMessage(chatId, `
📸 <b>Presensi Masuk Berhasil Dicatat!</b>

👤 <b>${user.name}</b> (${user.employee_id})
💼 Posisi: ${user.position || '-'}
⏰ Jam Masuk: <b>${currentTime}</b>
📊 Status: <b>${status === 'late' ? '⚠️ Terlambat' : '✅ Tepat Waktu'}</b>
${aiNote ? `\n🤖 <i>Catatan AI: ${aiNote}</i>\n` : ''}
Semangat bertugas dan sukses selalu untuk hari ini! 💪
        `.trim());

      } else if (!existing.clock_out) {
        // === CLOCK OUT ===
        let aiNote = '';
        try {
          const aiResult = await this.analyzeSelfieWithGemini(downloaded.buffer);
          aiNote = aiResult.note;
        } catch (_) {}

        const [inH, inM] = existing.clock_in.split(':').map(Number);
        const [outH, outM] = currentTime.split(':').map(Number);
        let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
        if (diffMinutes < 0) diffMinutes += 24 * 60;
        const workHours = Math.max(0, Math.round((diffMinutes / 60) * 100) / 100);

        const settings = this.getSettings();
        const endTime = settings.work_end || '17:00';
        const [endH, endM] = endTime.split(':').map(Number);
        const overtimeHours = Math.round(Math.max(0, (outH * 60 + outM) - (endH * 60 + endM)) / 60 * 100) / 100;

        dbHelper.prepare('UPDATE attendance SET clock_out = ?, clock_out_photo = ?, work_hours = ?, overtime_hours = ? WHERE id = ?')
          .run(currentTime, downloaded.relativePath, workHours, overtimeHours, existing.id);

        this.logActivity('attendance', user.id, user.name, `Presensi Pulang via Bot (${currentTime}, durasi: ${workHours} jam).`);

        await this.sendMessage(chatId, `
📸 <b>Presensi Pulang Berhasil Dicatat!</b>

👤 <b>${user.name}</b>
⏰ Jam Masuk: <b>${existing.clock_in}</b>
⏰ Jam Pulang: <b>${currentTime}</b>
⏱️ Durasi Kerja: <b>${workHours} Jam</b>
${overtimeHours > 0 ? `⭐ Lembur: <b>${overtimeHours} Jam</b>\n` : ''}${aiNote ? `\n🤖 <i>Catatan AI: ${aiNote}</i>\n` : ''}
Terima kasih atas dedikasi dan kerja kerasmu hari ini! Hati-hati di jalan ya! 🌟
        `.trim());

      } else {
        await this.sendMessage(chatId, `
ℹ️ <b>Presensi Hari Ini Lengkap</b>

Halo <b>${user.name}</b>, Anda sudah menyelesaikan presensi masuk (<b>${existing.clock_in}</b>) dan pulang (<b>${existing.clock_out}</b>) untuk hari ini.
Total jam kerja: <b>${existing.work_hours || 0} Jam</b>.
        `.trim());
      }
    } catch (err) {
      console.error('Error processing selfie:', err);
      await this.sendMessage(chatId, `⚠️ Gagal mencatat presensi dari foto: ${err.message}`);
    }
  }

  // Record clock in without photo
  async recordClockInWithoutPhoto(user, chatId, caption) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);

    const existing = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(user.id, today);
    if (existing && existing.clock_in) {
      await this.sendMessage(chatId, `ℹ️ Anda sudah mencatat presensi masuk hari ini pada pukul <b>${existing.clock_in}</b>.`);
      return;
    }

    const settings = this.getSettings();
    const startTime = settings.work_start || '08:00';
    const toleranceMin = parseInt(settings.late_tolerance || '15');

    let status = 'present';
    const [startH, startM] = startTime.split(':').map(Number);
    const [curH, curM] = currentTime.split(':').map(Number);
    if (curH * 60 + curM > startH * 60 + startM + toleranceMin) {
      status = 'late';
    }

    if (existing) {
      dbHelper.prepare('UPDATE attendance SET clock_in = ?, status = ?, notes = ? WHERE id = ?')
        .run(currentTime, status, caption || 'Absen via Telegram Bot', existing.id);
    } else {
      dbHelper.prepare('INSERT INTO attendance (user_id, date, clock_in, status, notes) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, today, currentTime, status, caption || 'Absen via Telegram Bot');
    }

    this.logActivity('attendance', user.id, user.name, `Presensi Masuk via Bot Text (${currentTime}).`);

    await this.sendMessage(chatId, `
✅ <b>Presensi Masuk Berhasil Dicatat!</b>

👤 <b>${user.name}</b>
⏰ Jam Masuk: <b>${currentTime}</b>
📊 Status: <b>${status === 'late' ? '⚠️ Terlambat' : '✅ Tepat Waktu'}</b>

Selamat bekerja dan sukses hari ini! 💪
    `.trim());
  }

  // Record clock out without photo
  async recordClockOutWithoutPhoto(user, chatId, caption) {
    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toTimeString().split(' ')[0].substring(0, 5);

    const existing = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(user.id, today);
    if (!existing || !existing.clock_in) {
      await this.sendMessage(chatId, `⚠️ Anda belum mencatat presensi masuk hari ini.`);
      return;
    }
    if (existing.clock_out) {
      await this.sendMessage(chatId, `ℹ️ Anda sudah mencatat presensi pulang pada pukul <b>${existing.clock_out}</b>.`);
      return;
    }

    const [inH, inM] = existing.clock_in.split(':').map(Number);
    const [outH, outM] = currentTime.split(':').map(Number);
    let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    const workHours = Math.max(0, Math.round((diffMinutes / 60) * 100) / 100);

    const settings = this.getSettings();
    const endTime = settings.work_end || '17:00';
    const [endH, endM] = endTime.split(':').map(Number);
    const overtimeHours = Math.round(Math.max(0, (outH * 60 + outM) - (endH * 60 + endM)) / 60 * 100) / 100;

    dbHelper.prepare('UPDATE attendance SET clock_out = ?, work_hours = ?, overtime_hours = ? WHERE id = ?')
      .run(currentTime, workHours, overtimeHours, existing.id);

    this.logActivity('attendance', user.id, user.name, `Presensi Pulang via Bot Text (${currentTime}).`);

    await this.sendMessage(chatId, `
✅ <b>Presensi Pulang Berhasil Dicatat!</b>

👤 <b>${user.name}</b>
⏰ Masuk: <b>${existing.clock_in}</b> | Pulang: <b>${currentTime}</b>
⏱️ Total Jam Kerja: <b>${workHours} Jam</b>
${overtimeHours > 0 ? `⭐ Lembur: <b>${overtimeHours} Jam</b>\n` : ''}
Terima kasih atas kerja samanya hari ini! Hati-hati di perjalanan pulang. 🌟
    `.trim());
  }

  // Send task list to employee
  async sendTaskList(user, chatId) {
    const tasks = dbHelper.prepare(`
      SELECT * FROM tasks
      WHERE assigned_to = ? AND status != 'done' AND status != 'cancelled'
      ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, deadline ASC
    `).all(user.id);

    if (tasks.length === 0) {
      await this.sendMessage(chatId, `
🎉 <b>Semua Tugas Selesai!</b>

Halo <b>${user.name}</b>, tidak ada tugas pending untuk Anda saat ini. Luar biasa! ✨
      `.trim());
      return;
    }

    let msg = `📋 <b>Daftar Tugas Anda (${tasks.length} tugas):</b>\n\n`;
    tasks.forEach((t, i) => {
      const pBadge = t.priority === 'urgent' ? '🔴 Sangat Mendesak' : t.priority === 'high' ? '🟠 Tinggi' : '🟡 Normal';
      msg += `<b>${i + 1}. #${t.id} - ${t.title}</b>\n`;
      msg += `   Prioritas: ${pBadge}\n`;
      if (t.deadline) msg += `   Tenggat: 📅 ${t.deadline}\n`;
      if (t.description) msg += `   Detail: <i>${t.description.substring(0, 100)}</i>\n`;
      msg += `\n`;
    });

    msg += `💡 <i>Untuk menandai tugas telah selesai, ketik:</i>\n<code>/selesai [ID_TUGAS]</code>\nContoh: <code>/selesai ${tasks[0].id}</code>`;

    await this.sendMessage(chatId, msg);
  }

  // Complete task via bot command
  async completeTaskViaBot(user, chatId, taskId) {
    const task = dbHelper.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      await this.sendMessage(chatId, `❌ Tugas dengan ID <b>#${taskId}</b> tidak ditemukan.`);
      return;
    }

    if (task.assigned_to !== user.id && user.role !== 'admin') {
      await this.sendMessage(chatId, `⚠️ Anda tidak ditugaskan untuk tugas <b>#${taskId}</b>.`);
      return;
    }

    if (task.status === 'done') {
      await this.sendMessage(chatId, `ℹ️ Tugas <b>#${taskId} - ${task.title}</b> memang sudah berstatus selesai.`);
      return;
    }

    dbHelper.prepare("UPDATE tasks SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);
    this.logActivity('task_update', user.id, user.name, `Menyelesaikan tugas #${taskId} (${task.title}) via Telegram.`);

    await this.sendMessage(chatId, `
🎉 <b>Tugas Berhasil Diselesaikan!</b>

Tugas: <b>#${task.id} - ${task.title}</b>
Status di sistem AbsenKu telah diubah menjadi <b>Selesai (Done)</b>.
Terima kasih atas kerja cepat Anda! ✨
    `.trim());
  }

  // Send status summary
  async sendStatusSummary(user, chatId) {
    const today = new Date().toISOString().split('T')[0];
    const att = dbHelper.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(user.id, today);
    const pendingTasks = dbHelper.prepare("SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status != 'done'").get(user.id).count;

    let text = `
ℹ️ <b>Status Kehadiran & Kerja Hari Ini:</b>

👤 Karyawan: <b>${user.name}</b> (${user.employee_id})
💼 Posisi: ${user.position || '-'}
📅 Tanggal: ${today}

⏰ Jam Masuk: <b>${att && att.clock_in ? att.clock_in : 'Belum Absen'}</b>
⏰ Jam Pulang: <b>${att && att.clock_out ? att.clock_out : '-'}</b>
📊 Status: <b>${att ? (att.status === 'late' ? '⚠️ Terlambat' : '✅ Tepat Waktu') : 'Belum Hadir'}</b>
⏱️ Jam Kerja: <b>${att && att.work_hours ? att.work_hours + ' jam' : '-'}</b>
📋 Tugas Pending: <b>${pendingTasks} tugas</b>
    `.trim();

    await this.sendMessage(chatId, text);
  }

  // Answer conversational questions using Gemini
  async answerWithGemini(user, chatId, query) {
    const settings = this.getSettings();
    if (!settings.gemini_api_key) {
      await this.sendMessage(chatId, `
🤖 <b>Asisten AbsenKu</b>

Maaf, saya tidak mengenali perintah tersebut.
Gunakan perintah berikut:
📸 <b>Kirim Foto Selfie:</b> Catat presensi
📋 <code>/tugas</code> : Lihat daftar tugas
✅ <code>/selesai &lt;id&gt;</code> : Tandai tugas selesai
ℹ️ <code>/status</code> : Cek status kehadiran
      `.trim());
      return;
    }

    try {
      const company = settings.company_name || 'DigiStore - Penjualan Produk Digital & Akun TikTok';
      const systemInstruction = `
Kamu adalah Asisten AI untuk sistem manajemen absensi dan tugas karyawan di "${company}".
Karyawan yang sedang chat bernama "${user.name}" dengan posisi "${user.position || 'Staf'}".
Jam operasional toko: ${settings.work_start || '08:00'} s/d ${settings.work_end || '17:00'}.
Jawab dengan ramah, profesional, sopan, dan ringkas dalam Bahasa Indonesia.
Jika karyawan bertanya tentang tugas, ingatkan mereka bisa mengetik /tugas.
Jika karyawan bertanya tentang absensi, jelaskan mereka cukup mengirim foto selfie di chat ini.
      `.trim();

      const aiReply = await this.askGemini(query, systemInstruction);
      this.logActivity('chat', user.id, user.name, `Tanya AI: "${query.substring(0, 50)}..."`);
      await this.sendMessage(chatId, `🤖 <b>Asisten AI AbsenKu:</b>\n\n${aiReply}`);
    } catch (e) {
      console.error('AI answer error:', e);
      await this.sendMessage(chatId, `🤖 Maaf, asisten AI sedang mengalami kendala jaringan. Silakan gunakan perintah tombol standar seperti <code>/tugas</code> atau kirim foto selfie.`);
    }
  }

  // ========== BROADCAST & REMINDERS ==========

  // Send attendance reminder to employees who haven't clocked in today
  async sendAttendanceReminders() {
    const today = new Date().toISOString().split('T')[0];
    const settings = this.getSettings();

    const employees = dbHelper.prepare(`
      SELECT u.id, u.name, u.employee_id, u.telegram_chat_id, u.position
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
      WHERE u.is_active = 1 AND (a.clock_in IS NULL OR a.id IS NULL)
    `).all(today);

    let sentCount = 0;
    for (const emp of employees) {
      if (emp.telegram_chat_id) {
        try {
          await this.sendMessage(emp.telegram_chat_id, `
⏰ <b>Peringatan Presensi Masuk!</b>

Halo <b>${emp.name}</b>, sistem mendeteksi Anda belum melakukan presensi masuk untuk hari ini (${today}).

Mohon segera lakukan presensi dengan <b>mengirimkan foto selfie</b> Anda langsung di chat bot ini atau melalui aplikasi web.
Semangat beraktivitas! ✨
          `.trim());
          sentCount++;
          this.logActivity('reminder', emp.id, emp.name, 'Pengingat presensi masuk terkirim via Telegram.');
        } catch (e) {
          console.error(`Failed to send reminder to ${emp.name}:`, e.message);
        }
      }
    }
    return { targetCount: employees.length, sentCount };
  }

  // Send task reminders to employees with pending tasks
  async sendTaskReminders() {
    const today = new Date().toISOString().split('T')[0];
    const pendingTasks = dbHelper.prepare(`
      SELECT t.*, u.name as assigned_name, u.telegram_chat_id
      FROM tasks t
      JOIN users u ON t.assigned_to = u.id
      WHERE t.status != 'done' AND t.status != 'cancelled' AND u.telegram_chat_id IS NOT NULL AND u.is_active = 1
      ORDER BY t.assigned_to
    `).all();

    // Group by user
    const byUser = {};
    pendingTasks.forEach(t => {
      if (!byUser[t.assigned_to]) byUser[t.assigned_to] = [];
      byUser[t.assigned_to].push(t);
    });

    let sentCount = 0;
    for (const [userId, tasks] of Object.entries(byUser)) {
      const userChatId = tasks[0].telegram_chat_id;
      const userName = tasks[0].assigned_name;

      let msg = `
📋 <b>Pengingat Tugas & Deadline Hari Ini:</b>

Halo <b>${userName}</b>, Anda memiliki <b>${tasks.length} tugas aktif</b> yang perlu dikerjakan:
      `.trim() + '\n\n';

      tasks.slice(0, 5).forEach((t, i) => {
        const urgent = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '🟡';
        msg += `${i + 1}. ${urgent} <b>#${t.id} - ${t.title}</b> (${t.deadline ? 'Tenggat: ' + t.deadline : 'Prioritas ' + t.priority})\n`;
      });

      if (tasks.length > 5) {
        msg += `\n<i>...dan ${tasks.length - 5} tugas lainnya.</i>\n`;
      }

      msg += `\nKetik <code>/tugas</code> untuk detail lengkap atau <code>/selesai [ID]</code> jika sudah selesai.`;

      try {
        await this.sendMessage(userChatId, msg);
        sentCount++;
        this.logActivity('reminder', userId, userName, `Pengingat ${tasks.length} tugas terkirim via Telegram.`);
      } catch (e) {
        console.error(`Failed to send task reminder to ${userName}:`, e.message);
      }
    }

    return { userCount: Object.keys(byUser).length, sentCount };
  }

  // Send daily summary report to admin
  async sendDailyReportToAdmin(targetChatId = null) {
    const settings = this.getSettings();
    const adminChatId = targetChatId || settings.telegram_admin_chat_id;

    if (!adminChatId) {
      throw new Error('Chat ID Admin Telegram belum diatur di pengaturan Asisten AI.');
    }

    const today = new Date().toISOString().split('T')[0];
    const totalEmployees = dbHelper.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1 AND role != "admin"').get().count;
    const presentCount = dbHelper.prepare('SELECT COUNT(*) as count FROM attendance WHERE date = ? AND clock_in IS NOT NULL').get(today).count;
    const lateCount = dbHelper.prepare('SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = "late"').get(today).count;
    const absentCount = Math.max(0, totalEmployees - presentCount);

    const doneTasksToday = dbHelper.prepare('SELECT COUNT(*) as count FROM tasks WHERE date(completed_at) = ?').get(today).count;
    const pendingTasks = dbHelper.prepare('SELECT COUNT(*) as count FROM tasks WHERE status != "done" AND status != "cancelled"').get().count;

    let reportMsg = `
📊 <b>LAPORAN HARIAN OPERASIONAL & PRESENSI</b>
🏢 <b>${settings.company_name || 'DigiStore'}</b>
📅 Tanggal: <b>${today}</b>
━━━━━━━━━━━━━━━━━━━━━
👥 <b>Kehadiran Tim:</b>
• Total Karyawan: <b>${totalEmployees} orang</b>
• Hadir: <b>${presentCount} orang</b>
• Tepat Waktu: <b>${Math.max(0, presentCount - lateCount)} orang</b>
• Terlambat: <b>${lateCount} orang</b>
• Belum Hadir / Cuti: <b>${absentCount} orang</b>

📋 <b>Aktivitas Jobdesk & Tugas:</b>
• Tugas Selesai Hari Ini: <b>${doneTasksToday} tugas</b>
• Tugas Masih Berjalan: <b>${pendingTasks} tugas</b>
━━━━━━━━━━━━━━━━━━━━━
<i>Laporan otomatis digenerate oleh Asisten AI AbsenKu.</i>
    `.trim();

    await this.sendMessage(adminChatId, reportMsg);
    this.logActivity('report', null, 'Admin', `Laporan harian berhasil dikirim ke Admin Telegram (Chat ID: ${adminChatId}).`);
    return { success: true, message: 'Laporan harian berhasil dikirim ke Admin Telegram.' };
  }

  // ========== POLLING SERVICE ==========

  startPolling() {
    if (this.pollingActive) return;
    this.pollingActive = true;
    console.log('🤖 Telegram Bot Polling service started.');

    const pollLoop = async () => {
      if (!this.pollingActive) return;
      const settings = this.getSettings();
      const token = settings.telegram_bot_token;

      if (!token) {
        this.pollTimer = setTimeout(pollLoop, 5000);
        return;
      }

      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=5`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            if (update.message) {
              await this.handleIncomingMessage(update.message);
            }
          }
        }
      } catch (err) {
        // Suppress repetitive polling network noise
      }

      if (this.pollingActive) {
        this.pollTimer = setTimeout(pollLoop, 1500);
      }
    };

    pollLoop();
    this.startScheduler();
  }

  stopPolling() {
    this.pollingActive = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.cronTimer) clearInterval(this.cronTimer);
    console.log('🤖 Telegram Bot Polling service stopped.');
  }

  // Periodic scheduler (runs every 60s)
  startScheduler() {
    if (this.cronTimer) clearInterval(this.cronTimer);

    let lastRanMinute = -1;

    this.cronTimer = setInterval(async () => {
      const now = new Date();
      const currentMinute = now.getHours() * 60 + now.getMinutes();
      if (currentMinute === lastRanMinute) return;
      lastRanMinute = currentMinute;

      const currentTimeStr = now.toTimeString().split(' ')[0].substring(0, 5); // '08:00'
      const settings = this.getSettings();

      // Check attendance reminder in (15 mins before work_start)
      if (settings.ai_auto_reminder_in === 'true' || settings.ai_auto_reminder_in === '1') {
        const workStart = settings.work_start || '08:00';
        const [wH, wM] = workStart.split(':').map(Number);
        const reminderMinutes = (wH * 60 + wM) - 15;
        if (currentMinute === reminderMinutes) {
          console.log('⏰ Triggering automated morning attendance reminder...');
          try { await this.sendAttendanceReminders(); } catch (e) {}
        }
      }

      // Check daily report time
      if (settings.ai_daily_report === 'true' || settings.ai_daily_report === '1') {
        const reportTime = settings.ai_daily_report_time || '17:30';
        if (currentTimeStr === reportTime) {
          console.log('📊 Triggering automated daily report to admin...');
          try { await this.sendDailyReportToAdmin(); } catch (e) {}
        }
      }
    }, 30000);
  }
}

const aiTelegramService = new AITelegramService();

module.exports = aiTelegramService;
