-- Datos de ejemplo. Para un cliente real: cambia la marca en "ajustes"
-- y reemplaza productos y reseñas (o súbelos después desde el panel).

INSERT INTO ajustes (clave, valor) VALUES
 ('marca', '{
    "nombre": "Malva",
    "nombre_legal": "Malva Cosmética SpA",
    "titulo": "Tu piel, con ingredientes que puedes pronunciar.",
    "bajada": "Sérums, cremas y maquillaje con extractos botánicos chilenos. Veganos, libres de crueldad y formulados para el clima de aquí.",
    "email": "hola@malva.cl",
    "whatsapp": "+56900000000",
    "instagram": "https://instagram.com/",
    "tiktok": "https://tiktok.com/"
 }'),
 ('colores', '{"bg":"#F8EFF3","ink":"#2E1A2B","muted":"#6E5868","brand":"#9C4F7E","sage":"#6F8461","sale":"#B23A5B"}'),
 ('envio', '{"region":"Tarapacá","gratis_desde":0,"zonas":[{"nombre":"Iquique","costo":2000,"activo":true},{"nombre":"Alto Hospicio","costo":2000,"activo":true},{"nombre":"Pozo Almonte","costo":4000,"activo":true},{"nombre":"La Tirana","costo":4000,"activo":true},{"nombre":"La Huayca","costo":4000,"activo":true},{"nombre":"Huara","costo":5000,"activo":true},{"nombre":"Pica","costo":5000,"activo":true}],"retiro":{"activo":true,"texto":"Te escribimos por WhatsApp para coordinar el lugar y la hora de retiro."}}'),
 ('anuncios', '["Entregas en Iquique, Alto Hospicio y alrededores","Hasta 30% de descuento en packs","Garantía de 30 días: si no te convence, te devolvemos tu dinero"]'),
 ('comparacion', '[["Ingredientes de origen natural",true,false],["Veganos y libres de crueldad",true,false],["Sin parabenos ni fragancias sintéticas",true,false],["Garantía de satisfacción de 30 días",true,false]]'),
 ('faq', '[
   ["¿Para qué tipo de piel son los productos?","Todas nuestras fórmulas están testeadas en piel sensible. En cada producto indicamos para qué tipo de piel es más recomendado."],
   ["¿En qué orden uso los productos?","Por la mañana: limpiador, sérum, crema hidratante y protector solar. Por la noche: limpiador, sérum y crema. El maquillaje va siempre al final."],
   ["¿Dónde entregan?","Entregamos en Iquique, Alto Hospicio, Pozo Almonte, La Tirana, La Huayca, Huara y Pica. Después de tu compra te escribimos por WhatsApp para coordinar el día y la hora. También puedes retirar sin costo."],
   ["¿Puedo devolver un producto?","Tienes 30 días para probarlo. Si no te convence, escríbenos y te devolvemos el dinero."]
 ]')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO categorias (slug, nombre, orden) VALUES
 ('facial', 'Cuidado facial', 1),
 ('maquillaje', 'Maquillaje', 2),
 ('packs', 'Packs', 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO productos (slug, nombre, descripcion, categoria_id, precio, precio_antes, stock, forma, colores, orden) VALUES
 ('serum-rosa-mosqueta','Sérum Rosa Mosqueta','Aceite de rosa mosqueta y niacinamida para manchas y textura.',(SELECT id FROM categorias WHERE slug='facial'),19990,23990,50,'dropper','["#F3D3DF","#C2648F"]',1),
 ('crema-maqui','Crema Hidratante Maqui','Hidratación de 24 horas con antioxidantes de maqui.',(SELECT id FROM categorias WHERE slug='facial'),17990,20990,40,'jar','["#E4D6EE","#7A4E99"]',2),
 ('gel-limpiador','Gel Limpiador Suave','Limpia sin resecar. Apto para piel sensible.',(SELECT id FROM categorias WHERE slug='facial'),12990,NULL,60,'pump','["#DCE8D3","#6F8461"]',3),
 ('base-luminosa','Base Luminosa FPS 30','Cobertura media, acabado natural, 8 tonos.',(SELECT id FROM categorias WHERE slug='maquillaje'),21990,24990,30,'tube','["#F2DCC8","#B98564"]',4),
 ('balsamo-labial','Bálsamo Labial con Color','Manteca de karité y un toque de color que dura.',(SELECT id FROM categorias WHERE slug='maquillaje'),8990,NULL,80,'stick','["#F6CFD3","#B23A5B"]',5),
 ('pack-rutina','Pack Rutina Completa','Limpiador, sérum y crema. Todo lo que tu piel necesita.',(SELECT id FROM categorias WHERE slug='packs'),39990,50970,20,'jar','["#EED6E4","#9C4F7E"]',6)
ON CONFLICT (slug) DO NOTHING;

-- Reseñas de ejemplo (BORRAR antes de publicar: deben ser de clientas reales)
INSERT INTO resenas (producto_id, nombre, estrellas, texto, verificada, aprobada)
SELECT p.id, r.nombre, r.estrellas, r.texto, TRUE, TRUE
FROM (VALUES
 ('serum-rosa-mosqueta','Camila R.',5,'Llevo un mes con el sérum y las manchas se notan mucho más claras.'),
 ('crema-maqui','Fernanda T.',5,'Tengo piel mixta y la crema me hidrata sin dejarme brillosa.'),
 ('base-luminosa','Josefa M.',4,'Me encanta el tono de la base, se ve como piel.'),
 ('pack-rutina','Valentina P.',5,'Compré el pack para regalar y terminé comprándome uno para mí.')
) AS r(slug,nombre,estrellas,texto)
JOIN productos p ON p.slug = r.slug
WHERE NOT EXISTS (SELECT 1 FROM resenas);

-- Opciones de ejemplo: tonos para la base y tamaños para la crema
UPDATE productos SET variante_etiqueta = 'Tono' WHERE slug = 'base-luminosa' AND variante_etiqueta IS NULL;
UPDATE productos SET variante_etiqueta = 'Tamaño' WHERE slug = 'crema-maqui' AND variante_etiqueta IS NULL;
INSERT INTO variantes (producto_id, nombre, color, precio, stock, orden)
SELECT p.id, v.nombre, v.color, v.precio, v.stock, v.orden
FROM (VALUES
  ('base-luminosa','Porcelana','#F3DCC8',NULL::int,8,1), ('base-luminosa','Arena','#E2BE98',NULL,5,2),
  ('base-luminosa','Miel','#C9935F',NULL,0,3), ('base-luminosa','Canela','#9C6B45',NULL,6,4),
  ('crema-maqui','50 ml',NULL,NULL,20,1), ('crema-maqui','100 ml',NULL,29990,10,2)
) AS v(slug, nombre, color, precio, stock, orden)
JOIN productos p ON p.slug = v.slug
ON CONFLICT (producto_id, nombre) DO NOTHING;

-- Textos de ejemplo para la página de producto
UPDATE productos SET
  detalle = 'Sérum ligero de rápida absorción que combina aceite de rosa mosqueta y niacinamida al 5%. Ayuda a emparejar el tono, suavizar la textura y atenuar manchas.

Apto para todo tipo de piel, incluso sensible.',
  ingredientes = 'Aqua, Rosa Canina Fruit Oil, Niacinamide, Glycerin, Sodium Hyaluronate, Tocopherol.',
  modo_uso = 'Aplica 3 a 4 gotas sobre el rostro limpio, mañana y noche, antes de tu crema hidratante. De día, usa siempre protector solar.'
WHERE slug = 'serum-rosa-mosqueta' AND detalle = '';
