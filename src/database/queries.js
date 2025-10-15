const { pool } = require('./connection');

// Queries para tabela rotas
const rotasQueries = {
    // Inserir nova rota
    insertRota: async (codigo, participanteId = null) => {
        const query = 'INSERT INTO rotas (codigo, participante_id) VALUES ($1, $2)';
        return await pool.query(query, [codigo, participanteId]);
    },

    // Buscar rota por código
    findByCodigo: async (codigo) => {
        const query = 'SELECT * FROM rotas WHERE codigo = $1';
        return await pool.query(query, [codigo]);
    },

    // Marcar rota como usada
    markAsUsed: async (codigo) => {
        const query = 'UPDATE rotas SET usado = TRUE WHERE codigo = $1';
        return await pool.query(query, [codigo]);
    },

    // Contar rotas geradas
    countRotas: async () => {
        const query = 'SELECT COUNT(*) as count FROM rotas';
        return await pool.query(query);
    },

    // Contar rotas usadas
    countRotasUsadas: async () => {
        const query = `
            SELECT COUNT(DISTINCT r.codigo) as count 
            FROM rotas r 
            INNER JOIN confirmacoes c ON r.codigo = c.codigo_rota
        `;
        return await pool.query(query);
    },

    // Verificar se código existe
    checkCodigoExists: async (codigo) => {
        const query = 'SELECT id FROM rotas WHERE codigo = $1';
        return await pool.query(query, [codigo]);
    },

    // Contar rotas de teste
    countTestRoutes: async () => {
        const query = 'SELECT COUNT(*) FROM rotas WHERE codigo LIKE \'TESTE_%\'';
        return await pool.query(query);
    },

    // Deletar rotas de teste
    deleteTestRoutes: async () => {
        const query = 'DELETE FROM rotas WHERE codigo LIKE \'TESTE_%\'';
        return await pool.query(query);
    }
};

// Queries para tabela confirmacoes
const confirmacoesQueries = {
    // Inserir confirmação
    insertConfirmacao: async (codigoRota, nome, telefone, email) => {
        const query = 'INSERT INTO confirmacoes (codigo_rota, nome, telefone, email) VALUES ($1, $2, $3, $4) RETURNING id';
        return await pool.query(query, [codigoRota, nome, telefone, email || null]);
    },

    // Buscar confirmação por ID
    findById: async (id) => {
        const query = 'SELECT * FROM confirmacoes WHERE id = $1';
        return await pool.query(query, [id]);
    },

    // Listar todas as confirmações
    listAll: async () => {
        const query = `
            SELECT c.*, r.codigo as rota_codigo, r.criado_em as rota_criada_em
            FROM confirmacoes c 
            LEFT JOIN rotas r ON c.codigo_rota = r.codigo 
            ORDER BY c.confirmado_em DESC
        `;
        return await pool.query(query);
    },

    // Contar confirmações
    countConfirmacoes: async () => {
        const query = 'SELECT COUNT(*) as count FROM confirmacoes';
        return await pool.query(query);
    },

    // Contar webhooks enviados
    countWebhooksEnviados: async () => {
        const query = 'SELECT COUNT(*) as count FROM confirmacoes WHERE webhook_enviado = TRUE';
        return await pool.query(query);
    },

    // Marcar webhook como enviado
    markWebhookSent: async (id) => {
        const query = 'UPDATE confirmacoes SET webhook_enviado = TRUE WHERE id = $1';
        return await pool.query(query, [id]);
    },

    // Deletar confirmações de teste
    deleteTestConfirmations: async () => {
        const query = 'DELETE FROM confirmacoes WHERE codigo_rota LIKE \'TESTE_%\'';
        return await pool.query(query);
    }
};

// Queries para tabela participantes_importados
const participantesQueries = {
    // Inserir participante completo
    insertParticipante: async (dadosParticipante) => {
        const query = `
            INSERT INTO participantes_importados 
            (carimbo_data_hora, nome, genero, idade, cpf, cidade, bairro, aposentado, telefone, email, projeto_extensao, outro_projeto, autorizacao_dados, dificuldades) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
        `;
        return await pool.query(query, [
            dadosParticipante.carimbo_data_hora,
            dadosParticipante.nome,
            dadosParticipante.genero,
            dadosParticipante.idade,
            dadosParticipante.cpf,
            dadosParticipante.cidade,
            dadosParticipante.bairro,
            dadosParticipante.aposentado,
            dadosParticipante.telefone,
            dadosParticipante.email,
            dadosParticipante.projeto_extensao,
            dadosParticipante.outro_projeto,
            dadosParticipante.autorizacao_dados,
            dadosParticipante.dificuldades
        ]);
    },

    // Buscar participante por código de rota
    findByCodigo: async (codigo) => {
        const query = `
            SELECT p.nome, p.telefone, p.email 
            FROM participantes_importados p
            INNER JOIN rotas r ON r.participante_id = p.id
            WHERE r.codigo = $1
        `;
        return await pool.query(query, [codigo]);
    },

    // Listar participantes para envio
    listForSending: async () => {
        const query = `
            SELECT 
                p.id,
                p.nome,
                p.telefone,
                p.projeto_extensao,
                r.codigo,
                CASE 
                    WHEN c.id IS NOT NULL THEN true 
                    ELSE false 
                END as confirmado
            FROM participantes_importados p
            INNER JOIN rotas r ON r.participante_id = p.id
            LEFT JOIN confirmacoes c ON c.codigo_rota = r.codigo
            WHERE p.telefone IS NOT NULL AND p.telefone != ''
            ORDER BY p.nome
        `;
        return await pool.query(query);
    },

    // Listar participantes para envio filtrados por projeto
    listForSendingByProject: async (projetoExtensao) => {
        const query = `
            SELECT 
                p.id,
                p.nome,
                p.telefone,
                p.projeto_extensao,
                r.codigo,
                CASE 
                    WHEN c.id IS NOT NULL THEN true 
                    ELSE false 
                END as confirmado
            FROM participantes_importados p
            INNER JOIN rotas r ON r.participante_id = p.id
            LEFT JOIN confirmacoes c ON c.codigo_rota = r.codigo
            WHERE p.telefone IS NOT NULL AND p.telefone != '' 
            AND p.projeto_extensao = $1
            ORDER BY p.nome
        `;
        return await pool.query(query, [projetoExtensao]);
    },

    // Buscar participantes selecionados
    findSelected: async (participanteIds) => {
        const placeholders = participanteIds.map((_, index) => `$${index + 1}`).join(',');
        const query = `
            SELECT 
                p.id,
                p.nome,
                p.telefone,
                r.codigo
            FROM participantes_importados p
            INNER JOIN rotas r ON r.participante_id = p.id
            WHERE p.id IN (${placeholders}) AND p.telefone IS NOT NULL AND p.telefone != ''
            ORDER BY p.nome
        `;
        return await pool.query(query, participanteIds);
    },

    // Contar participantes importados
    countParticipantes: async () => {
        const query = 'SELECT COUNT(*) as count FROM participantes_importados';
        return await pool.query(query);
    },

    // Buscar participantes sem rota
    findWithoutRoute: async () => {
        const query = `
            SELECT * FROM participantes_importados 
            WHERE id NOT IN (SELECT participante_id FROM rotas WHERE participante_id IS NOT NULL)
        `;
        return await pool.query(query);
    },

    // Deletar participantes de teste
    deleteTestParticipants: async (nomes) => {
        const placeholders = nomes.map((_, index) => `$${index + 1}`).join(',');
        const query = `DELETE FROM participantes_importados WHERE nome IN (${placeholders})`;
        return await pool.query(query, nomes);
    },

    // Listar participantes com mensagens enviadas mas não confirmadas
    listSentButNotConfirmed: async () => {
        const query = `
            SELECT 
                p.id,
                p.nome,
                p.telefone,
                p.projeto_extensao,
                r.codigo,
                r.criado_em as mensagem_enviada_em
            FROM participantes_importados p
            INNER JOIN rotas r ON r.participante_id = p.id
            LEFT JOIN confirmacoes c ON c.codigo_rota = r.codigo
            WHERE p.telefone IS NOT NULL AND p.telefone != ''
            AND c.id IS NULL
            ORDER BY r.criado_em DESC
        `;
        return await pool.query(query);
    }
};

module.exports = {
    rotasQueries,
    confirmacoesQueries,
    participantesQueries
};