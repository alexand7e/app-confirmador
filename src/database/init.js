const { pool } = require('./connection');

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
            dificuldades TEXT
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
        
        console.log(`✅ Todos os dados de teste carregados com sucesso! ${codigosTeste.length} participantes criados.`);
        return codigosTeste;
    } catch (error) {
        console.error('❌ Erro ao carregar dados de teste:', error);
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