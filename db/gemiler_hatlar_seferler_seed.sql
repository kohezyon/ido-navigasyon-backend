INSERT INTO gemiler (ad) VALUES ('Yalova Feribotu 1');

INSERT INTO hatlar (ad) VALUES ('Yalova - Istanbul');

INSERT INTO rota_noktalari (hat_id, sira, ad, enlem, boylam)
SELECT id, 0, 'Yalova', 40.6500, 29.2600 FROM hatlar WHERE ad = 'Yalova - Istanbul';
INSERT INTO rota_noktalari (hat_id, sira, ad, enlem, boylam)
SELECT id, 1, 'Bozuk Gemi Batigi', 40.7200, 29.1600 FROM hatlar WHERE ad = 'Yalova - Istanbul';
INSERT INTO rota_noktalari (hat_id, sira, ad, enlem, boylam)
SELECT id, 2, 'Heybeliada', 40.8756, 29.0917 FROM hatlar WHERE ad = 'Yalova - Istanbul';
INSERT INTO rota_noktalari (hat_id, sira, ad, enlem, boylam)
SELECT id, 3, 'Istanbul', 41.0100, 29.0200 FROM hatlar WHERE ad = 'Yalova - Istanbul';

UPDATE ilgi_noktalari SET hat_id = (SELECT id FROM hatlar WHERE ad = 'Yalova - Istanbul')
WHERE hat_id IS NULL;
