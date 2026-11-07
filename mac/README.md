# OpenCut — Mac uygulaması

OpenCut Classic'i yerel bir Mac uygulaması olarak paketler. Next.js sunucusu
uygulamanın içinde yalnızca `127.0.0.1:47321` üzerinde çalışır. Projeler ve videolar
`~/Library/Application Support/OpenCut` altında, tarayıcı depolamasında (IndexedDB + OPFS)
tutulur. Hiçbir şey internete yüklenmez.

## Yeniden build

Gerekenler: Bun, Node, Xcode Command Line Tools.

```sh
bun install                       # repo kökünde
# apps/web/.env.local yoksa: sahte değerlerle oluştur (bkz. apps/web/.env.example);
# editör bu servisleri kullanmaz, sadece env doğrulaması için gerekir.
cd mac
bun install
bun run icon            # build/icon.icns (isteğe bağlı, zaten var)
bun run prepare-server  # web build + standalone sunucu düzeni
bun run dist            # dist/OpenCut-<sürüm>-arm64.dmg
```

## Notlar

- Port 47321 sabittir: tarayıcı depolaması adrese bağlıdır, port değişirse projeler görünmez.
- Giriş, geri bildirim, Freesound ses arama ve blog çevrimdışı çalışmaz. Editör, kaydetme ve dışa aktarma çalışır.
- Web build'inde gömülü analitik (databuddy) uygulama içinde engellenir.
- Ad-hoc imzalıdır (Apple geliştirici hesabı yok). Bu Mac'te doğrudan açılır.
  Başka bir Mac'e kopyalanırsa ilk açılışta sağ tık → Aç gerekir.
- Sunucu logu: `~/Library/Logs/OpenCut/server.log`
