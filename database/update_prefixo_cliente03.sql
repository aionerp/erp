-- ============================================================================
-- SCRIPT DE ATUALIZAÇÃO: PREFIXO DO CLIENTE 03 (ORIGINAL ELETRÔNICO)
-- Execute este comando no SQL Editor do Supabase do Cliente 03:
-- https://supabase.com/dashboard/project/jzbqyeyzgvvjqsohliee/sql
-- ============================================================================

-- 1. Atualizar emails de usuários substituindo 'originaleltronico' por 'originaleletronico'
UPDATE public.usuarios
SET email = replace(email, 'originaleltronico', 'originaleletronico')
WHERE email LIKE '%originaleltronico%';

-- 2. Garantir que o administrador principal esteja com o prefixo correto
UPDATE public.usuarios
SET email = 'adm.originaleletronico'
WHERE email = 'adm.originaleltronico' OR email ILIKE '%originaleltronico%';

-- 3. Visualizar usuários atualizados
SELECT id, loja_id, nome, email, perfil, nivel_acesso, ativo, created_at
FROM public.usuarios;
