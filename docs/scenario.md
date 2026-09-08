# Skenario merge (dari pemilik produk, verbatim)

> Gw akan merge kedua service tersebut menjadi satu service. Skenarionya
>
> 1. Kastamer memesan lewat form pemesanan udang
> 2. Admin pun bisa memasukan pesanan baru lewat atmin dashboard, mengikuti formulir yang ada pada pemesanan udang
> 3. Saat Kastamer klik "pesan", isi pesanan langsung dibawa ke database dan langsung terdaftar pada atmin dashboard (jadi admin tidak perlu isi manual lagi)
> 4. Admin bisa melakukan operasi status antar dengan sudah antar atau belum antar, dan status bayar sudah bayar atau belum bayar.
> 5. Admin atau User juga bisa memasukan alamat yang berbeda (saat ini unique key adalah nama dan nomor telepon)
>
> Perlu diperhatikan
>
> 1. Fitur dari atmin dashboard tetap dijaga, kecuali pengisian pesanan baru (ini ngikut aset dari pemesanan udang)
> 2. Fitur dari pemesanan udang pun juga tidak diubah
>
> Gw minta, kedua service pemesanan udang dan atmin dashboard menggunakan react sebagai Server Side Rendering.

## Poin-poin yang sudah pasti

- Satu service React SSR, gabungan form publik + dashboard admin.
- Form pemesanan publik (UUA) → submit menulis ke database yang sama dipakai dashboard (poin 3), bukan cuma WhatsApp.
- Form "tambah pesanan baru" di dashboard diganti pakai formulir yang sama dengan form publik (poin 2).
- Semua fitur dashboard lain **tidak berubah** (poin "perlu diperhatikan" #1) — status antar/bayar, kastamer, wilayah, transaksi, rute, harga, promo.
- UX/fitur form publik **tidak berubah** (poin "perlu diperhatikan" #2).
- Kastamer/admin bisa input alamat berbeda-beda — unique key kastamer saat ini `nama + noHp`, ini perlu berubah supaya satu kastamer bisa punya banyak alamat (poin 5).

## Sudah dikonfirmasi pemilik produk

- **WhatsApp redirect tetap ada.** DB write adalah **tambahan**, bukan pengganti — form publik tetap redirect ke WA seperti sekarang.
- **Model alamat: 1 Kastamer : N Alamat.** Kastamer tetap 1 profil (unique by `noHp`), simpan banyak alamat, pilih salah satu tiap pesan.
- **Submit TIDAK langsung dari browser ke Firestore.** Form publik (dan form admin) submit ke **API/server action di service SSR** (data-access layer), yang lalu menulis ke Firestore pakai Admin SDK server-side. Firestore security rules bisa tetap tertutup penuh (tidak perlu public write rule) — semua validasi field wajib, format, dan proteksi abuse terjadi di server sebelum tulis ke DB.
