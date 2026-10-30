-- CotaFlow — e-mail para comprovantes de entrega, por cliente. O botão "Enviar
-- por e-mail" do comprovante já abre o e-mail com este destinatário. Aceita
-- mais de um endereço, separados por ponto e vírgula.
alter table clients add column if not exists proof_email text;
