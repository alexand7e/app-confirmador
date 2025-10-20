const { pool } = require('./connection');

// Dados iniciais das mensagens
const mensagensIniciais = [
    {
        tipo: 'convite_whatsapp',
        titulo: 'Convite para Treinamento CapacitIA',
        conteudo: `Olá, *{nome}*! Tudo bem? 😄

Você foi convidada(o) para o treinamento CapacitIA – Autonomia Digital para Pessoas Idosas , promovido pela Secretaria de Inteligência Artificial do Piauí .

📅 14 e 16 de outubro (terça e quinta)
🕗 08h às 12h
📍 Espaço da Cidadania Digital (próx. ao Estádio Lindolfo Monteiro)

Para confirmar sua presença, clique no link abaixo 👇
🔗 {baseUrl}/{codigo}

💻 Será um momento *leve, acolhedor e cheio de prática* — pra todo mundo aprender de forma simples e divertida!`,
        variaveis: JSON.stringify(['nome', 'codigo', 'baseUrl'])
    },
    {
        tipo: 'confirmacao_whatsapp',
        titulo: 'Mensagem de Confirmação de Presença',
        conteudo: `Olá, {nome}! 🎉

Que alegria ter você conosco! 💛
Sua participação no *treinamento CapacitIA – Autonomia Digital* para Pessoas Idosas foi confirmada com sucesso! 🙌

📍 Local: {local}
📅 Dias: {dias}
🕗 Horário: {horario}

O curso será *leve, acolhedor e com muita prática, pra você aprender de forma simples, divertida e no seu ritmo!* 💻✨

Estamos muito felizes em receber você! 😊`,
        variaveis: JSON.stringify(['nome', 'local', 'dias', 'horario'])
    },
    {
        tipo: 'recusa_whatsapp',
        titulo: 'Mensagem de Recusa de Participação',
        conteudo: `Olá, {nome}! 😊

Obrigado por nos informar sobre sua disponibilidade. 💛

Entendemos que você não poderá participar do *treinamento CapacitIA – Autonomia Digital* para Pessoas Idosas nesta ocasião.

📢 *Fique atento às nossas próximas turmas!*
Você será sempre bem-vindo(a) em futuras oportunidades.

Para mais informações sobre nossos próximos treinamentos, acompanhe nossos canais de comunicação.`,
        variaveis: JSON.stringify(['nome'])
    },
    {
        tipo: 'info_treinamento',
        titulo: 'Informações do Treinamento',
        conteudo: JSON.stringify({
            nome_evento: 'CapacitIA – Autonomia Digital para Pessoas Idosas',
            local: 'R. Clodoaldo Freitas, 729 - Centro (Norte), Teresina - PI, 64000-360 (próx. ao Lindolfo Monteiro)',
            endereco: 'R. Clodoaldo Freitas, 729 - Centro (Norte), Teresina - PI, 64000-360 (próx. ao Lindolfo Monteiro)',
            dias: '14 e 16 de outubro de 2025 (terça e quinta)',
            horario: '08h às 12h',
            mensagem_final: 'Aguardamos você no treinamento!'
        }),
        variaveis: JSON.stringify(['nome_evento', 'local', 'endereco', 'dias', 'horario', 'mensagem_final'])
    }
];

// Queries de criação de tabelas
const createTablesQueries = {
    // Criar tabela rotas
    createRotasTable: `
        CREATE TABLE IF NOT EXISTS rotas (
            id SERIAL PRIMARY KEY,
            codigo VARCHAR(255) UNIQUE NOT NULL,
            participante_id INTEGER,
            usado BOOLEAN DEFAULT FALSE,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,

    // Criar tabela confirmacoes
    createConfirmacoesTable: `
        CREATE TABLE IF NOT EXISTS confirmacoes (
            id SERIAL PRIMARY KEY,
            codigo_rota VARCHAR(255) NOT NULL,
            nome VARCHAR(255) NOT NULL,
            telefone VARCHAR(15) NOT NULL,
            email VARCHAR(255),
            confirmado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            webhook_enviado BOOLEAN DEFAULT FALSE
        )
    `,

    // Criar tabela participantes_importados
    createParticipantesTable: `
        CREATE TABLE IF NOT EXISTS participantes_importados (
            id SERIAL PRIMARY KEY,
            carimbo_data_hora TIMESTAMP,
            nome VARCHAR(255) NOT NULL,
            genero VARCHAR(50),
            idade INTEGER,
            cpf VARCHAR(14),
            cidade VARCHAR(100),
            bairro VARCHAR(100),
            aposentado VARCHAR(10),
            telefone VARCHAR(15),
            email VARCHAR(255),
            projeto_extensao VARCHAR(255),
            outro_projeto VARCHAR(255),
            autorizacao_dados VARCHAR(10),
            dificuldades TEXT,
            data_incorporacao DATE DEFAULT CURRENT_DATE
        )
    `,

    // Criar tabela mensagens
    createMensagensTable: `
        CREATE TABLE IF NOT EXISTS mensagens (
            id SERIAL PRIMARY KEY,
            tipo VARCHAR(50) NOT NULL, -- 'convite_whatsapp', 'info_treinamento', etc.
            titulo VARCHAR(255) NOT NULL,
            conteudo TEXT NOT NULL,
            variaveis JSON, -- Armazena variáveis disponíveis como {nome}, {codigo}, etc.
            ativo BOOLEAN DEFAULT TRUE,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `,

    // Criar tabela historico_mensagens
    createHistoricoMensagensTable: `
        CREATE TABLE IF NOT EXISTS historico_mensagens (
            id SERIAL PRIMARY KEY,
            mensagem_id INTEGER REFERENCES mensagens(id) ON DELETE CASCADE,
            conteudo_anterior TEXT NOT NULL,
            conteudo_novo TEXT NOT NULL,
            usuario VARCHAR(100) DEFAULT 'admin',
            motivo VARCHAR(255),
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `
};

// Dados de teste para Alexandre, João e Karol
const dadosTeste = [
    {
        carimbo_data_hora: new Date(),
        nome: 'Alexandre',
        genero: 'Masculino',
        idade: 35,
        cpf: '123.456.789-00',
        cidade: 'Teresina',
        bairro: 'Centro',
        aposentado: 'Não',
        telefone: '86981813317',
        email: 'alexandre@teste.com',
        projeto_extensao: 'Projeto Digital',
        outro_projeto: 'Não',
        autorizacao_dados: 'Sim',
        dificuldades: 'Nenhuma dificuldade específica relatada'
    },
    {
        carimbo_data_hora: new Date(),
        nome: 'João',
        genero: 'Masculino',
        idade: 28,
        cpf: '987.654.321-00',
        cidade: 'Teresina',
        bairro: 'Dirceu',
        aposentado: 'Não',
        telefone: '86999852058',
        email: 'joao@teste.com',
        projeto_extensao: 'Projeto Educação',
        outro_projeto: 'Não',
        autorizacao_dados: 'Sim',
        dificuldades: 'Nenhuma dificuldade específica relatada'
    },
    {
        carimbo_data_hora: new Date(),
        nome: 'Karol',
        genero: 'Feminino',
        idade: 32,
        cpf: '456.789.123-00',
        cidade: 'Teresina',
        bairro: 'Fátima',
        aposentado: 'Não',
        telefone: '86988255887',
        email: 'karol@teste.com',
        projeto_extensao: 'Projeto Saúde',
        outro_projeto: 'Não',
        autorizacao_dados: 'Sim',
        dificuldades: 'Nenhuma dificuldade específica relatada'
    },
    {
        carimbo_data_hora: new Date(),
        nome: 'Gratty',
        genero: 'Feminino',
        idade: 29,
        cpf: '321.654.987-00',
        cidade: 'Teresina',
        bairro: 'Mocambinho',
        aposentado: 'Não',
        telefone: '86999602422',
        email: 'gratty@teste.com',
        projeto_extensao: 'Projeto Digital',
        outro_projeto: 'Não',
        autorizacao_dados: 'Sim',
        dificuldades: 'Nenhuma dificuldade específica relatada'
    }
];

// Função para inicializar o banco de dados
const initializeDatabase = async () => {
    try {
        console.log('🔧 Iniciando criação das tabelas...');
        
        // Criar tabela rotas
        await pool.query(createTablesQueries.createRotasTable);
        console.log('✅ Tabela rotas criada/verificada');

        // Criar tabela confirmacoes
        await pool.query(createTablesQueries.createConfirmacoesTable);
        console.log('✅ Tabela confirmacoes criada/verificada');

        // Criar tabela participantes_importados
        await pool.query(createTablesQueries.createParticipantesTable);
        console.log('✅ Tabela participantes_importados criada/verificada');

        // Criar tabela mensagens
        await pool.query(createTablesQueries.createMensagensTable);
        console.log('✅ Tabela mensagens criada/verificada');

        // Criar tabela historico_mensagens
        await pool.query(createTablesQueries.createHistoricoMensagensTable);
        console.log('✅ Tabela historico_mensagens criada/verificada');

        console.log('🎉 Todas as tabelas foram criadas/verificadas com sucesso!');
        return true;
    } catch (error) {
        console.error('❌ Erro ao criar tabelas:', error);
        throw error;
    }
};

// Função para carregar dados de teste
const carregarDadosTeste = async () => {
    try {
        console.log('📊 Carregando dados de teste...');
        
        // Verificar se já existem dados de teste
        const existingTest = await pool.query('SELECT id FROM participantes_importados WHERE nome IN ($1, $2, $3)', ['Alexandre', 'João', 'Karol']);
        
        if (existingTest.rows.length > 0) {
            console.log('ℹ️  Dados de teste já existem, pulando inserção');
            // Mesmo que os dados de teste existam, verificar se as mensagens precisam ser carregadas
            await carregarMensagensIniciais();
            return;
        }

        const codigosTeste = [];

        // Inserir dados de teste para cada participante
        const insertQuery = `
            INSERT INTO participantes_importados 
            (carimbo_data_hora, nome, genero, idade, cpf, cidade, bairro, aposentado, telefone, email, projeto_extensao, outro_projeto, autorizacao_dados, dificuldades) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
        `;
        
        for (const participante of dadosTeste) {
            const result = await pool.query(insertQuery, [
                participante.carimbo_data_hora,
                participante.nome,
                participante.genero,
                participante.idade,
                participante.cpf,
                participante.cidade,
                participante.bairro,
                participante.aposentado,
                participante.telefone,
                participante.email,
                participante.projeto_extensao,
                participante.outro_projeto,
                participante.autorizacao_dados,
                participante.dificuldades
            ]);

            const participanteId = result.rows[0].id;

            // Gerar código de teste único para cada participante
            const codigoTeste = `TESTE_${participante.nome.toUpperCase()}_${Date.now()}`;
            
            // Inserir rota de teste
            await pool.query('INSERT INTO rotas (codigo, participante_id) VALUES ($1, $2)', [codigoTeste, participanteId]);
            
            codigosTeste.push({
                nome: participante.nome,
                telefone: participante.telefone,
                codigo: codigoTeste
            });

            console.log(`✅ Participante ${participante.nome} carregado com código: ${codigoTeste}`);
        }

        // Carregar mensagens iniciais
        await carregarMensagensIniciais();
        
        console.log(`✅ Todos os dados de teste carregados com sucesso! ${codigosTeste.length} participantes criados.`);
        return codigosTeste;
    } catch (error) {
        console.error('❌ Erro ao carregar dados de teste:', error);
        throw error;
    }
};

// Função para carregar mensagens iniciais
const carregarMensagensIniciais = async () => {
    try {
        console.log('📝 Verificando mensagens iniciais...');
        
        // Verificar se já existem mensagens na tabela
        const existingMessages = await pool.query('SELECT COUNT(*) as count FROM mensagens');
        const messageCount = parseInt(existingMessages.rows[0].count);
        
        if (messageCount > 0) {
            console.log(`ℹ️  Já existem ${messageCount} mensagens na tabela, pulando inserção`);
            return;
        }

        console.log('📝 Carregando mensagens iniciais...');
        for (const mensagem of mensagensIniciais) {
            const result = await pool.query(
                'INSERT INTO mensagens (tipo, titulo, conteudo, variaveis) VALUES ($1, $2, $3, $4) RETURNING id',
                [mensagem.tipo, mensagem.titulo, mensagem.conteudo, mensagem.variaveis]
            );
            console.log(`✅ Mensagem '${mensagem.titulo}' carregada com ID: ${result.rows[0].id}`);
        }
        
        console.log('✅ Mensagens iniciais carregadas com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao carregar mensagens iniciais:', error);
        console.error('Detalhes do erro:', error.message);
        throw error;
    }
};

// Função para limpar dados de teste
const limparDadosTeste = async () => {
    try {
        console.log('🧹 Limpando dados de teste...');
        
        // Deletar confirmações de teste
        await pool.query('DELETE FROM confirmacoes WHERE codigo_rota LIKE \'TESTE_%\'');
        
        // Deletar rotas de teste
        await pool.query('DELETE FROM rotas WHERE codigo LIKE \'TESTE_%\'');
        
        // Deletar participantes de teste
        await pool.query('DELETE FROM participantes_importados WHERE nome IN ($1, $2, $3)', ['Alexandre', 'João', 'Karol']);
        
        console.log('✅ Dados de teste limpos com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao limpar dados de teste:', error);
        throw error;
    }
};

const resetarBancoDados = async () => {
    try {
        console.log('🔄 Resetando banco de dados...');
        
        // Fazer DROP das tabelas na ordem correta (devido às foreign keys)
        await pool.query('DROP TABLE IF EXISTS confirmacoes CASCADE');
        console.log('✅ Tabela confirmacoes removida');
        
        await pool.query('DROP TABLE IF EXISTS rotas CASCADE');
        console.log('✅ Tabela rotas removida');
        
        await pool.query('DROP TABLE IF EXISTS participantes_importados CASCADE');
        console.log('✅ Tabela participantes_importados removida');
        
        console.log('🎉 Banco de dados resetado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao resetar banco de dados:', error);
        throw error;
    }
};

module.exports = {
    initializeDatabase,
    carregarDadosTeste,
    limparDadosTeste,
    resetarBancoDados,
    dadosTeste
};