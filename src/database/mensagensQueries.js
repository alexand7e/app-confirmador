const { pool } = require('./connection');

const mensagensQueries = {
    // Buscar mensagem por tipo
    buscarPorTipo: async (tipo) => {
        const query = `
            SELECT * FROM mensagens 
            WHERE tipo = $1 AND ativo = true 
            ORDER BY atualizado_em DESC 
            LIMIT 1
        `;
        const result = await pool.query(query, [tipo]);
        return result.rows[0];
    },

    // Listar todas as mensagens
    listarTodas: async () => {
        const query = `
            SELECT * FROM mensagens 
            ORDER BY tipo, atualizado_em DESC
        `;
        const result = await pool.query(query);
        return result.rows;
    },

    // Criar nova mensagem
    criar: async (tipo, titulo, conteudo, variaveis = null) => {
        const query = `
            INSERT INTO mensagens (tipo, titulo, conteudo, variaveis)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const result = await pool.query(query, [tipo, titulo, conteudo, variaveis]);
        return result.rows[0];
    },

    // Atualizar mensagem
    atualizar: async (id, titulo, conteudo, variaveis = null, usuario = 'admin', motivo = null) => {
        // Primeiro, buscar o conteúdo atual para o histórico
        const mensagemAtual = await pool.query('SELECT * FROM mensagens WHERE id = $1', [id]);
        
        if (mensagemAtual.rows.length === 0) {
            throw new Error('Mensagem não encontrada');
        }

        const conteudoAnterior = mensagemAtual.rows[0].conteudo;

        // Atualizar a mensagem
        const updateQuery = `
            UPDATE mensagens 
            SET titulo = $1, conteudo = $2, variaveis = $3, atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING *
        `;
        const result = await pool.query(updateQuery, [titulo, conteudo, variaveis, id]);

        // Registrar no histórico
        const historicoQuery = `
            INSERT INTO historico_mensagens (mensagem_id, conteudo_anterior, conteudo_novo, usuario, motivo)
            VALUES ($1, $2, $3, $4, $5)
        `;
        await pool.query(historicoQuery, [id, conteudoAnterior, conteudo, usuario, motivo]);

        return result.rows[0];
    },

    // Ativar/desativar mensagem
    alterarStatus: async (id, ativo) => {
        const query = `
            UPDATE mensagens 
            SET ativo = $1, atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;
        const result = await pool.query(query, [ativo, id]);
        return result.rows[0];
    },

    // Buscar histórico de uma mensagem
    buscarHistorico: async (mensagemId) => {
        const query = `
            SELECT h.*, m.titulo, m.tipo
            FROM historico_mensagens h
            JOIN mensagens m ON h.mensagem_id = m.id
            WHERE h.mensagem_id = $1
            ORDER BY h.criado_em DESC
        `;
        const result = await pool.query(query, [mensagemId]);
        return result.rows;
    }
};

module.exports = mensagensQueries;