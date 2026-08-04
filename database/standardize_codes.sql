-- Script SQL para padronizar os códigos de todos os produtos existentes de forma sequencial (A0001, A0002...)
DO $$
DECLARE
    prod RECORD;
    letter CHAR(1) := 'A';
    num INT := 1;
    code VARCHAR(10);
BEGIN
    FOR prod IN SELECT id FROM public.produtos ORDER BY id ASC LOOP
        code := letter || LPAD(num::text, 4, '0');
        UPDATE public.produtos SET codigo = code WHERE id = prod.id;
        
        num := num + 1;
        IF num > 9999 THEN
            num := 1;
            letter := CHR(ASCII(letter) + 1);
            IF letter > 'Z' THEN
                letter := 'A';
            END IF;
        END IF;
    END LOOP;
END $$;
