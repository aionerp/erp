// js/security.js
// Camada de Segurança, Criptografia e Proteção de Dados (Aion ERP)

(function(window) {
    'use strict';

    const Security = {
        /**
         * Gera hash SHA-256 a partir de uma string utilizando a Web Crypto API nativa
         * @param {string} text 
         * @returns {Promise<string>} hash hexadecimal
         */
        async sha256(text) {
            if (!text) return '';
            if (window.crypto && window.crypto.subtle) {
                const msgBuffer = new TextEncoder().encode(text);
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            }
            // Fallback simples caso subtle crypto não esteja disponível
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash |= 0;
            }
            return String(Math.abs(hash));
        },

        /**
         * Sanitiza strings para evitar injeção de HTML/XSS
         * @param {string} str 
         * @returns {string} string sanitizada
         */
        sanitizeHtml(str) {
            if (typeof str !== 'string') return str;
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        },

        /**
         * Mascarar CPF ou CNPJ para logs e exibições seguras
         * @param {string} doc 
         * @returns {string}
         */
        mascararDocumento(doc) {
            if (!doc) return '***';
            const clean = String(doc).replace(/\D/g, '');
            if (clean.length === 11) {
                return clean.replace(/(\d{3})\d{5}(\d{3})/, '$1.***.***-$2');
            } else if (clean.length === 14) {
                return clean.replace(/(\d{2})\d{8}(\d{4})/, '$1.***.***/$2');
            }
            return '***';
        },

        /**
         * Salva dados no sessionStorage removendo campos altamente sensíveis (ex: senhas em texto puro)
         * @param {string} key 
         * @param {object} value 
         */
        setSecureSession(key, value) {
            try {
                if (typeof value === 'object' && value !== null) {
                    const cloned = JSON.parse(JSON.stringify(value));
                    delete cloned.senha;
                    delete cloned.password;
                    delete cloned.token_secreto;
                    sessionStorage.setItem(key, JSON.stringify(cloned));
                } else {
                    sessionStorage.setItem(key, value);
                }
            } catch (e) {
                console.warn('Erro ao gravar sessão segura:', e);
            }
        },

        /**
         * Recupera dados da sessão
         * @param {string} key 
         * @returns {any}
         */
        getSecureSession(key) {
            try {
                const item = sessionStorage.getItem(key);
                if (!item) return null;
                try {
                    return JSON.parse(item);
                } catch {
                    return item;
                }
            } catch (e) {
                return null;
            }
        }
    };

    window.Security = Security;

    // Proteção de console em produção para não expor credenciais
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const _warn = console.warn;
        console.warn = function(...args) {
            if (args[0] && typeof args[0] === 'string' && args[0].includes('KEY')) return;
            _warn.apply(console, args);
        };
    }

})(window);
