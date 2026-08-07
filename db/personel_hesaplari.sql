CREATE TABLE IF NOT EXISTS personel_hesaplari (
    id SERIAL PRIMARY KEY,
    kullanici_adi TEXT NOT NULL UNIQUE,
    sifre_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('personel', 'kaptan', 'admin')),
    olusturulma_zamani TIMESTAMPTZ NOT NULL DEFAULT now()
);
