CREATE TABLE IF NOT EXISTS gemiler (
    id SERIAL PRIMARY KEY,
    ad TEXT NOT NULL UNIQUE,
    olusturulma_zamani TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hatlar (
    id SERIAL PRIMARY KEY,
    ad TEXT NOT NULL UNIQUE,
    olusturulma_zamani TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rota_noktalari (
    id SERIAL PRIMARY KEY,
    hat_id INTEGER NOT NULL REFERENCES hatlar(id),
    sira INTEGER NOT NULL,
    ad TEXT NOT NULL,
    enlem DOUBLE PRECISION NOT NULL,
    boylam DOUBLE PRECISION NOT NULL,
    UNIQUE (hat_id, sira)
);

CREATE TABLE IF NOT EXISTS seferler (
    id SERIAL PRIMARY KEY,
    gemi_id INTEGER NOT NULL REFERENCES gemiler(id),
    hat_id INTEGER NOT NULL REFERENCES hatlar(id),
    baslatan_personel_id INTEGER NOT NULL REFERENCES personel_hesaplari(id),
    baslangic_zamani TIMESTAMPTZ NOT NULL DEFAULT now(),
    bitis_zamani TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS seferler_aktif_gemi_tekil
    ON seferler (gemi_id) WHERE bitis_zamani IS NULL;

ALTER TABLE ilgi_noktalari ADD COLUMN IF NOT EXISTS hat_id INTEGER REFERENCES hatlar(id);
