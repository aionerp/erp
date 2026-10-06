import os
import sys
import argparse
from fpdf import FPDF
from fpdf.enums import XPos, YPos

class FichaCadastralPDF(FPDF):
    def __init__(self, is_exemplo=True, dados=None):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.is_exemplo = is_exemplo
        self.dados = dados or {}
        self.set_auto_page_break(auto=True, margin=15)
        
        # Carregar fontes TrueType do Windows para acentuação perfeita
        font_dir = r"C:\Windows\Fonts"
        self.add_font("Arial", "", os.path.join(font_dir, "arial.ttf"))
        self.add_font("Arial", "B", os.path.join(font_dir, "arialbd.ttf"))
        self.add_font("Arial", "I", os.path.join(font_dir, "ariali.ttf"))
        self.add_font("Arial", "BI", os.path.join(font_dir, "arialbi.ttf"))

    def header(self):
        # Faixa superior escura
        self.set_fill_color(10, 22, 40) # #0A1628
        self.rect(0, 0, 210, 24, "F")
        
        # Faixa de destaque azul institucional
        self.set_fill_color(37, 99, 235) # #2563EB
        self.rect(0, 24, 210, 2, "F")

        # Título principal
        self.set_xy(12, 5)
        self.set_text_color(255, 255, 255)
        self.set_font("Arial", "B", 13.5)
        self.cell(120, 7, "AION ERP - FICHA CADASTRAL E DE CONFIGURAÇÃO", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")
        
        # Tag no canto direito
        self.set_xy(135, 6)
        if self.is_exemplo:
            self.set_fill_color(220, 38, 38) # Destaque vermelho
            self.set_font("Arial", "B", 8.5)
            self.cell(63, 6, "EXEMPLO PREENCHIDO: PADARIA 1", 0, 0, "C", fill=True)
        else:
            self.set_fill_color(16, 185, 129) # Verde institucional
            self.set_font("Arial", "B", 8.5)
            self.cell(63, 6, "MODELO OFICIAL DE IMPLANTAÇÃO", 0, 0, "C", fill=True)

        self.set_xy(12, 13)
        self.set_font("Arial", "", 8.5)
        self.set_text_color(203, 213, 225)
        self.cell(120, 5, "Formulário de Coleta de Informações para Provisionamento de Loja (Multicliente)", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
        
        self.ln(12)

    def footer(self):
        self.set_y(-14)
        self.set_font("Arial", "", 7.5)
        self.set_text_color(100, 116, 139)
        self.set_draw_color(226, 232, 240)
        self.line(12, 283, 198, 283)
        
        self.set_xy(12, -13)
        self.cell(90, 8, "Aion ERP Core - Arquitetura Multicliente com Bancos Isolados PostgreSQL", new_x=XPos.RIGHT, new_y=YPos.TOP, align="L")
        self.set_xy(102, -13)
        self.cell(96, 8, f"Página {self.page_no()} de {{nb}}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")

    def section_title(self, num, title):
        self.ln(2)
        self.set_fill_color(241, 245, 249) # #F1F5F9
        self.set_draw_color(203, 213, 225)
        self.set_text_color(15, 23, 42)
        self.set_font("Arial", "B", 9.5)
        self.cell(186, 6.2, f"  {num}. {title.upper()}", border="L", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Linha lateral esquerda azul
        curr_y = self.get_y() - 6.2
        self.set_draw_color(37, 99, 235)
        self.set_line_width(0.8)
        self.line(12, curr_y, 12, curr_y + 6.2)
        self.set_line_width(0.2)
        self.ln(1.5)

    def draw_field(self, label, value, width, height=9, is_highlight=False):
        curr_x = self.get_x()
        curr_y = self.get_y()
        
        self.set_draw_color(203, 213, 225)
        if is_highlight:
            self.set_fill_color(239, 246, 255)
        else:
            self.set_fill_color(255, 255, 255)
            
        self.rect(curr_x, curr_y, width, height, "DF")
        
        # Label
        self.set_xy(curr_x + 1.5, curr_y + 1)
        self.set_font("Arial", "B", 6.5)
        self.set_text_color(100, 116, 139)
        self.cell(width - 3, 3, label.upper(), 0, 0, "L")
        
        # Valor
        self.set_xy(curr_x + 1.5, curr_y + 4.2)
        self.set_font("Arial", "B" if is_highlight else "", 8.2)
        if is_highlight:
            self.set_text_color(29, 78, 216)
        else:
            self.set_text_color(15, 23, 42)
        self.cell(width - 3, 4.2, str(value), 0, 0, "L")
        
        self.set_xy(curr_x + width, curr_y)

    def draw_checkbox(self, label, checked=False, width=62, height=7.5):
        curr_x = self.get_x()
        curr_y = self.get_y()
        
        self.set_draw_color(203, 213, 225)
        if checked:
            self.set_fill_color(239, 246, 255)
        else:
            self.set_fill_color(248, 250, 252)
        self.rect(curr_x, curr_y, width, height, "DF")
        
        box_size = 3.6
        box_x = curr_x + 2.5
        box_y = curr_y + 1.9
        self.set_draw_color(71, 85, 105)
        if checked:
            self.set_fill_color(37, 99, 235)
            self.rect(box_x, box_y, box_size, box_size, "DF")
            self.set_text_color(255, 255, 255)
            self.set_font("Arial", "B", 6.5)
            self.set_xy(box_x + 0.5, box_y - 0.2)
            self.cell(box_size, box_size, "X", 0, 0, "C")
        else:
            self.set_fill_color(255, 255, 255)
            self.rect(box_x, box_y, box_size, box_size, "DF")
            
        self.set_xy(curr_x + 8, curr_y + 1.2)
        self.set_font("Arial", "B" if checked else "", 7.5)
        self.set_text_color(15, 23, 42) if checked else self.set_text_color(71, 85, 105)
        self.cell(width - 9, 5, label, 0, 0, "L")
        self.set_xy(curr_x + width, curr_y)


def construir_pdf(nome_arquivo, is_exemplo=True, dados=None):
    pdf = FichaCadastralPDF(is_exemplo=is_exemplo, dados=dados)
    pdf.alias_nb_pages()
    pdf.add_page()
    
    # -------------------------------------------------------------
    # BOX DE DESTAQUE: EXPLICAÇÃO DO "PREFIXO DO USUÁRIO" NO ERP
    # -------------------------------------------------------------
    pdf.set_fill_color(248, 250, 252)
    pdf.set_draw_color(37, 99, 235)
    pdf.set_line_width(0.4)
    box_y = pdf.get_y()
    pdf.rect(12, box_y, 186, 27, "DF")
    pdf.set_line_width(0.2)
    
    pdf.set_xy(15, box_y + 2.2)
    pdf.set_font("Arial", "B", 8.5)
    pdf.set_text_color(37, 99, 235)
    pdf.cell(180, 4, "[i] O QUE É O 'PREFIXO DO USUÁRIO' NO AION ERP? (EXPLICAÇÃO DO SISTEMA)", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    
    pdf.set_xy(15, box_y + 6.8)
    pdf.set_font("Arial", "", 7.2)
    pdf.set_text_color(30, 41, 59)
    txt_explicacao = (
        "O Aion ERP possui arquitetura Multicliente (Multi-tenant) com bancos de dados isolados no Neon PostgreSQL.\n"
        "Como a tela de login (index.html) é única, o PREFIXO DO USUÁRIO é o identificador exclusivo da sua empresa no sistema.\n"
        "• Regra de Login: Todos os colaboradores utilizam o formato [nome_usuario].[prefixo] (Ex: adm.padaria1, caixa.padaria1, balcao.padaria1).\n"
        "• Como o sistema valida: Ao digitar o login, o ERP lê o prefixo (.padaria1), consulta o arquivo clients.json, "
        "localiza a conexão segura da loja e conecta automaticamente ao banco exclusivo da sua empresa antes de validar a senha."
    )
    pdf.multi_cell(180, 3.4, txt_explicacao)
    pdf.set_y(box_y + 28.5)

    # -------------------------------------------------------------
    # SEÇÃO 1: IDENTIFICAÇÃO DA EMPRESA (LOJA / TENANT)
    # -------------------------------------------------------------
    pdf.section_title(1, "Identificação da Empresa (Dados Fiscais e Jurídicos)")
    
    if is_exemplo:
        r_social = "Padaria 1 Panificadora e Confeitaria Ltda."
        n_fantasia = "Padaria 1 - Matriz Centro"
        cnpj_val = "00.000.000/0001-00 (Validação: 14 dígitos)"
        ie_val = "123.456.789.110"
        segmento_val = "mercado (Validação no banco: mercado, restaurante, eletronico, geral)"
        fundacao_val = "15/03/2021"
    else:
        r_social = ""
        n_fantasia = ""
        cnpj_val = ""
        ie_val = ""
        segmento_val = "Selecione: [ ] Mercado/Padaria  [ ] Restaurante  [ ] Geral"
        fundacao_val = "    /    /        "

    # Linha 1
    pdf.set_x(12)
    pdf.draw_field("Razão Social (Nome da Loja no Sistema - companyName)*", r_social, 120, is_highlight=True)
    pdf.draw_field("Nome Fantasia / Unidade (companySubtitle)", n_fantasia, 66)
    pdf.ln(9.5)
    
    # Linha 2
    pdf.set_x(12)
    pdf.draw_field("CNPJ (Validado com 14 dígitos pelo sistema)*", cnpj_val, 70, is_highlight=True)
    pdf.draw_field("Inscrição Estadual (IE)", ie_val, 50)
    pdf.draw_field("Data de Fundação", fundacao_val, 36)
    pdf.draw_field("Regime Fiscal", "Simples Nacional" if is_exemplo else "", 30)
    pdf.ln(9.5)

    # Linha 3
    pdf.set_x(12)
    pdf.draw_field("Segmento de Atuação (Validação de Banco: public.lojas.segmento)*", segmento_val, 186)
    pdf.ln(10.5)

    # -------------------------------------------------------------
    # SEÇÃO 2: LOCALIZAÇÃO E ENDEREÇO DA UNIDADE
    # -------------------------------------------------------------
    pdf.section_title(2, "Localização e Endereço da Empresa")
    
    if is_exemplo:
        cep_val = "01001-000"
        logradouro_val = "Rua do Comércio Central"
        numero_val = "1050"
        comp_val = "Térreo - Loja 1"
        bairro_val = "Centro Histórico"
        cidade_val = "São Paulo"
        uf_val = "SP"
    else:
        cep_val = ""
        logradouro_val = ""
        numero_val = ""
        comp_val = ""
        bairro_val = ""
        cidade_val = ""
        uf_val = ""

    # Linha 1
    pdf.set_x(12)
    pdf.draw_field("CEP (Formato 00000-000)*", cep_val, 36)
    pdf.draw_field("Logradouro / Endereço (Rua, Av, Pça)*", logradouro_val, 114)
    pdf.draw_field("Número*", numero_val, 36, is_highlight=True)
    pdf.ln(9.5)

    # Linha 2
    pdf.set_x(12)
    pdf.draw_field("Complemento", comp_val, 46)
    pdf.draw_field("Bairro*", bairro_val, 50)
    pdf.draw_field("Cidade / Município*", cidade_val, 64)
    pdf.draw_field("Estado (UF)*", uf_val, 26)
    pdf.ln(10.5)

    # -------------------------------------------------------------
    # SEÇÃO 3: CONTATOS E RESPONSÁVEL LEGAL
    # -------------------------------------------------------------
    pdf.section_title(3, "Responsável Legal e Canais de Contato")

    if is_exemplo:
        resp_nome = "Ailton Cordeiro"
        resp_cargo = "Sócio Administrador"
        resp_tel = "(11) 98765-4321"
        resp_email = "contato@padaria1.com.br"
        resp_cpf = "123.456.789-00"
    else:
        resp_nome = ""
        resp_cargo = ""
        resp_tel = ""
        resp_email = ""
        resp_cpf = ""

    # Linha 1
    pdf.set_x(12)
    pdf.draw_field("Nome do Responsável / Proprietário*", resp_nome, 100)
    pdf.draw_field("Cargo / Função", resp_cargo, 46)
    pdf.draw_field("CPF do Responsável", resp_cpf, 40)
    pdf.ln(9.5)

    # Linha 2
    pdf.set_x(12)
    pdf.draw_field("Telefone Comercial / WhatsApp (Para Notificações)*", resp_tel, 80)
    pdf.draw_field("E-mail Oficial (Contato / Recuperação / Boletos)*", resp_email, 106)
    pdf.ln(11)

    # -------------------------------------------------------------
    # SEÇÃO 4: CONFIGURAÇÕES DE ACESSO AO ERP (O PREFIXO NA PRÁTICA)
    # -------------------------------------------------------------
    pdf.section_title(4, "Configurações de Acesso ao ERP (Credenciais e Prefixo)")

    if is_exemplo:
        prefixo_val = "padaria1"
        login_adm_val = "adm.padaria1"
        senha_prov_val = "P@daria1#2026"
        resp_adm_val = "Ailton Cordeiro (Administrador Geral)"
    else:
        prefixo_val = ""
        login_adm_val = "adm.[prefixo_escolhido]"
        senha_prov_val = ""
        resp_adm_val = ""

    # Linha 1
    pdf.set_x(12)
    pdf.draw_field("Prefixo do Usuário (Palavra única minúscula, sem acentos)*", prefixo_val, 80, is_highlight=True)
    pdf.draw_field("Login de Acesso Gerado para o Administrador*", login_adm_val, 60, is_highlight=True)
    pdf.draw_field("Senha Provisória*", senha_prov_val, 46)
    pdf.ln(9.5)

    # Linha 2
    pdf.set_x(12)
    pdf.draw_field("Nome Completo do Usuário Administrador (public.usuarios)*", resp_adm_val, 110)
    pdf.draw_field("Perfil no ERP", "Administrador (Acesso Irrestrito / Perfil admin)", 76)
    pdf.ln(10.5)

    # -------------------------------------------------------------
    # SEÇÃO 5: MÓDULOS E RECURSOS OPERACIONAIS (FEATURE FLAGS DO CLIENTE)
    # -------------------------------------------------------------
    pdf.section_title(5, "Módulos Operacionais Solicitados (Configuração das Features da Loja)")
    
    pdf.set_xy(12, pdf.get_y())
    pdf.set_font("Arial", "I", 7)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(186, 3.5, "Marque os módulos operacionais que deverão ficar ativos no ERP deste cliente:", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)

    # Checkboxes linha 1
    pdf.set_x(12)
    pdf.draw_checkbox("Módulo Mesas & Comandas (habilitar_mesas: true)", checked=is_exemplo, width=93)
    pdf.draw_checkbox("Controle de Lotes e Validade (habilitar_lotes: true)", checked=is_exemplo, width=93)
    pdf.ln(8)

    # Checkboxes linha 2
    pdf.set_x(12)
    pdf.draw_checkbox("Variações de Produtos (habilitar_variacoes: true)", checked=is_exemplo, width=93)
    pdf.draw_checkbox("Controle de Seriais / IMEI (habilitar_seriais: false)", checked=False, width=93)
    pdf.ln(8)

    # Checkboxes linha 3
    pdf.set_x(12)
    pdf.draw_checkbox("Agendamentos com Hora Marcada (habilitar_agendamentos)", checked=False, width=93)
    pdf.draw_checkbox("Gestão de Assinaturas e Recorrência Mensal", checked=False, width=93)
    pdf.ln(10)

    # =============================================================
    # PÁGINA 2: ESPECIFICAÇÃO TÉCNICA E CHECKLIST DE VALIDAÇÃO
    # =============================================================
    pdf.add_page()

    # -------------------------------------------------------------
    # SEÇÃO 6: PARÂMETROS TÉCNICOS DE IMPLANTAÇÃO (USO INTERNO / TI)
    # -------------------------------------------------------------
    pdf.section_title(6, "Parâmetros Técnicos de Provisionamento (Uso da Equipe Aion ERP)")

    if is_exemplo:
        client_id_val = "cliente03 (Próximo sequencial ativo no ERP)"
        db_provider = "Neon PostgreSQL (neondb isolado)"
        env_var_val = "CLIENTE03_DATABASE_URL=postgresql://neondb_owner:***@ep-***.neon.tech/neondb"
        pasta_config = "clients/cliente03/config.json"
        cmd_migracao = "node scripts/migration/02_setup_neon_schema.js cliente03"
    else:
        client_id_val = "cliente03 (ou próximo número vago)"
        db_provider = "Neon PostgreSQL"
        env_var_val = "CLIENTE[XX]_DATABASE_URL=..."
        pasta_config = "clients/cliente[XX]/config.json"
        cmd_migracao = "node scripts/migration/02_setup_neon_schema.js cliente[XX]"

    pdf.set_x(12)
    pdf.draw_field("Client ID no Sistema (Identificador de Pasta)", client_id_val, 93)
    pdf.draw_field("Provedor do Banco de Dados", db_provider, 93)
    pdf.ln(9.5)

    pdf.set_x(12)
    pdf.draw_field("Variável de Conexão (.env e Render.com)", env_var_val, 186)
    pdf.ln(9.5)

    pdf.set_x(12)
    pdf.draw_field("Arquivo de Configuração da Loja", pasta_config, 93)
    pdf.draw_field("Comando de Provisionamento (21 Tabelas)", cmd_migracao, 93)
    pdf.ln(11)

    # -------------------------------------------------------------
    # SEÇÃO 7: ESTRUTURA DO CONFIG.JSON CORRESPONDENTE (CÓDIGO GERADO)
    # -------------------------------------------------------------
    pdf.section_title(7, "Arquivo de Configuração do Sistema Gerado (config.json)")

    code_box_y = pdf.get_y()
    pdf.set_fill_color(15, 23, 42)
    pdf.rect(12, code_box_y, 186, 52, "F")
    
    pdf.set_xy(16, code_box_y + 3)
    pdf.set_font("Courier", "", 7.5)
    pdf.set_text_color(147, 197, 253)
    
    if is_exemplo:
        json_code = (
            "{\n"
            '  "clientId": "cliente03",\n'
            '  "companyName": "Padaria 1 Panificadora e Confeitaria Ltda.",\n'
            '  "companySubtitle": "Matriz Centro",\n'
            '  "prefix": "padaria1",                   // <-- PREFIXO DO USUÁRIO NO LOGIN\n'
            '  "cnpj": "00.000.000/0001-00",\n'
            '  "active": true,\n'
            '  "configured": true,\n'
            '  "database": { "provider": "neon", "connectionId": "cliente03" },\n'
            '  "branding": { "primaryColor": "#D97706", "primaryDarkColor": "#78350F", "primaryLightColor": "#FDE68A" },\n'
            '  "features": {\n'
            '    "habilitar_mesas": true,              // Ativo para comandas de mesa/balcão\n'
            '    "habilitar_lotes": true,              // Ativo para controle de validade de pães/frios\n'
            '    "habilitar_variacoes": true,          // Ativo para porções e tamanhos\n'
            '    "habilitar_seriais": false, "habilitar_agendamentos": false\n'
            "  }\n"
            "}"
        )
    else:
        json_code = (
            "{\n"
            '  "clientId": "cliente[XX]",\n'
            '  "companyName": "[Preencher Razão Social]",\n'
            '  "companySubtitle": "[Preencher Nome Fantasia / Unidade]",\n'
            '  "prefix": "[preencher_prefixo]",        // Minúsculas, ex: padaria1\n'
            '  "cnpj": "[00.000.000/0000-00]",\n'
            '  "active": true,\n'
            '  "configured": true,\n'
            '  "database": { "provider": "neon", "connectionId": "cliente[XX]" },\n'
            '  "branding": { "primaryColor": "#111824", "primaryDarkColor": "#0a1525", "primaryLightColor": "#152031" },\n'
            '  "features": {\n'
            '    "habilitar_mesas": false, "habilitar_lotes": false, "habilitar_seriais": false,\n'
            '    "habilitar_agendamentos": false, "habilitar_variacoes": false\n'
            "  }\n"
            "}"
        )
    pdf.multi_cell(180, 3.8, json_code)
    pdf.set_y(code_box_y + 55)

    # -------------------------------------------------------------
    # SEÇÃO 8: CHECKLIST DE VALIDAÇÃO NO SISTEMA (CONFORMIDADE)
    # -------------------------------------------------------------
    pdf.section_title(8, "Checklist de Validação das Informações no Sistema")

    pdf.set_x(12)
    pdf.draw_checkbox("Validação de CNPJ e Trava de Primeiro Acesso (anti-repetição de loja)", checked=True, width=93)
    pdf.draw_checkbox("Criação de Usuário Administrador (adm.[prefixo]) com Perfil Total", checked=True, width=93)
    pdf.ln(7.5)

    pdf.set_x(12)
    pdf.draw_checkbox("Provisionamento das 21 Tabelas e Triggers Bcrypt no Neon", checked=True, width=93)
    pdf.draw_checkbox("Cadastro da Loja em public.lojas com o segmento correto", checked=True, width=93)
    pdf.ln(7.5)

    pdf.set_x(12)
    pdf.draw_checkbox("Compilação do Catálogo Multicliente (build.js executado)", checked=True, width=93)
    pdf.draw_checkbox("Teste de Login Inicial com Sucesso no Navegador", checked=True, width=93)
    pdf.ln(11)

    # -------------------------------------------------------------
    # SEÇÃO 9: TERMO DE AUTORIZAÇÃO E ASSINATURAS
    # -------------------------------------------------------------
    pdf.section_title(9, "Termo de Ciência, Validação e Assinatura")

    pdf.set_x(12)
    pdf.set_font("Arial", "", 7.2)
    pdf.set_text_color(51, 65, 85)
    termo = (
        "Declaramos que as informações cadastrais e de configuração acima prestadas são verdadeiras e refletem as especificações "
        "solicitadas para o provisionamento do ambiente Aion ERP. O prefixo definido é de uso institucional para login de todos os operadores "
        "da empresa e não poderá ser alterado após a consolidação das tabelas no banco de dados."
    )
    pdf.multi_cell(186, 3.6, termo)
    pdf.ln(4)

    pdf.set_x(12)
    data_str = "São Paulo, _____ de ___________________ de 2026." if is_exemplo else "Local: ____________________________, _____ de _________________ de 2026."
    pdf.set_font("Arial", "I", 8)
    pdf.cell(186, 5, data_str, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="L")
    pdf.ln(6)

    # Linhas de Assinatura
    sign_y = pdf.get_y()
    pdf.set_draw_color(100, 116, 139)
    pdf.line(20, sign_y, 95, sign_y)
    pdf.line(115, sign_y, 190, sign_y)

    pdf.set_xy(20, sign_y + 1.5)
    pdf.set_font("Arial", "B", 8)
    pdf.cell(75, 4, "PADARIA 1 / RESPONSÁVEL LEGAL" if is_exemplo else "RESPONSÁVEL LEGAL DA EMPRESA", 0, 0, "C")
    
    pdf.set_xy(115, sign_y + 1.5)
    pdf.cell(75, 4, "AION ERP / IMPLANTAÇÃO TÉCNICA", 0, 0, "C")

    pdf.set_xy(20, sign_y + 5.5)
    pdf.set_font("Arial", "", 7)
    pdf.cell(75, 4, "Assinatura do Cliente", 0, 0, "C")
    
    pdf.set_xy(115, sign_y + 5.5)
    pdf.cell(75, 4, "Analista de Sistemas Responsável", 0, 0, "C")

    pdf.output(nome_arquivo)
    print(f"[SUCESSO] PDF gerado: {nome_arquivo}")

if __name__ == "__main__":
    pasta_destino = r"C:\Users\ailton.cordeiro\ERP-Novo\erp\documentos"
    os.makedirs(pasta_destino, exist_ok=True)
    
    pdf_exemplo = os.path.join(pasta_destino, "Ficha_Cadastral_Exemplo_Padaria1.pdf")
    construir_pdf(pdf_exemplo, is_exemplo=True)
    
    pdf_modelo = os.path.join(pasta_destino, "Ficha_Cadastral_Modelo_Em_Branco.pdf")
    construir_pdf(pdf_modelo, is_exemplo=False)
