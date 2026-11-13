// Utility helper untuk zona waktu Indonesia Barat (WIB / Asia/Jakarta / UTC+7)

function getWIB() {
  const now = new Date();
  
  // Tanggal format YYYY-MM-DD sesuai waktu Indonesia Barat
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  // Jam format HH:MM (24-jam) sesuai waktu Indonesia Barat
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);

  const hour = parts.find(p => p.type === 'hour')?.value || '00';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  const time = `${hour}:${minute}`;

  return { date, time, now };
}

function getWIBDate() {
  return getWIB().date;
}

function getWIBTime() {
  return getWIB().time;
}

module.exports = { getWIB, getWIBDate, getWIBTime };
