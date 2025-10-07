const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

// Sistema de logging melhorado
const logLevel = process.env.LOG_LEVEL || 'info';
const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };

const logger = {
    error: (message, ...args) => {
        if (logLevels[logLevel] >= logLevels.error) {
            console.error(`❌ [ERROR] ${message}`, ...args);
        }
    },
    warn: (message, ...args) => {
        if (logLevels[logLevel] >= logLevels.warn) {
            console.warn(`⚠️  [WARN] ${message}`, ...args);
        }
    },
    info: (message, ...args) => {
        if (logLevels[logLevel] >= logLevels.info) {
            console.log(`ℹ️  [INFO] ${message}`, ...args);
        }
    },
    debug: (message, ...args) => {
        if (logLevels[logLevel] >= logLevels.debug) {
            console.log(`🐛 [DEBUG] ${message}`, ...args);
        }
    }
};

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configuração do banco de dados usando variáveis de ambiente
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : false
});

// Inicializar banco de dados
async function initDatabase() {
    try {
        logger.info('Inicializando banco de dados...');
        
        // Dropar tabelas existentes para recriar com estrutura correta
        await pool.query('DROP TABLE IF EXISTS confirmacoes CASCADE');
        await pool.query('DROP TABLE IF EXISTS rotas CASCADE');
        await pool.query('DROP TABLE IF EXISTS participantes_importados CASCADE');
        
        logger.debug('Tabelas antigas removidas');
        
        await pool.query(`
            CREATE TABLE rotas (
                id SERIAL PRIMARY KEY,
                codigo VARCHAR(20) UNIQUE NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                participante_id INTEGER,
                usado BOOLEAN DEFAULT FALSE
            )
        `);

        await pool.query(`
            CREATE TABLE confirmacoes (
                id SERIAL PRIMARY KEY,
                codigo_rota VARCHAR(20) NOT NULL,
                nome VARCHAR(255) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                email VARCHAR(255),
                confirmado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                webhook_enviado BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (codigo_rota) REFERENCES rotas (codigo)
            )
        `);

        await pool.query(`
            CREATE TABLE participantes_importados (
                id SERIAL PRIMARY KEY,
                carimbo_data_hora TEXT,
                nome TEXT NOT NULL,
                genero TEXT,
                idade TEXT,
                cpf TEXT,
                cidade TEXT,
                bairro TEXT,
                aposentado TEXT,
                telefone TEXT NOT NULL,
                email TEXT,
                projeto_extensao TEXT,
                outro_projeto TEXT,
                autorizacao_dados TEXT,
                dificuldades TEXT,
                importado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Adicionar foreign key após criar as tabelas
        await pool.query(`
            ALTER TABLE rotas 
            ADD CONSTRAINT fk_participante 
            FOREIGN KEY (participante_id) REFERENCES participantes_importados(id)
        `);

        logger.info('Banco de dados PostgreSQL inicializado com sucesso!');
        
        // Carregar dados de teste automaticamente
        await carregarDadosTeste();
        
    } catch (error) {
        logger.error('Erro ao inicializar banco de dados:', error);
        throw error;
    }
}

// Função para carregar dados de teste automaticamente
async function carregarDadosTeste() {
    try {
        logger.info('Carregando dados de teste automaticamente...');
        
        // Verificar se já existem dados de teste
        const existingTest = await pool.query('SELECT COUNT(*) FROM rotas WHERE codigo LIKE \'TESTE_%\'');
        if (parseInt(existingTest.rows[0].count) > 0) {
            logger.info('Dados de teste já existem, pulando carregamento automático');
            return;
        }
        
        let importados = 0;
        
        // Dados de teste - removendo duplicação do Alexandre
        const dadosTeste = [
            {
                nome: 'Marina',
                telefone: '86999503015',
                email: 'marina@teste.com'
            }
        ];
        
        for (const dadoTeste of dadosTeste) {
            try {
                // Inserir participante de teste
                const participanteResult = await pool.query(`
                    INSERT INTO participantes_importados 
                    (nome, telefone, email) 
                    VALUES ($1, $2, $3)
                    RETURNING id
                `, [
                    dadoTeste.nome,
                    dadoTeste.telefone,
                    dadoTeste.email
                ]);
                
                const participanteId = participanteResult.rows[0].id;
                
                // Gerar código único para o teste
                const codigo = 'TESTE_' + gerarCodigoAleatorio();
                
                // Inserir na tabela rotas
                await pool.query(`
                    INSERT INTO rotas (codigo, participante_id) 
                    VALUES ($1, $2)
                `, [codigo, participanteId]);
                
                importados++;
                logger.info(`Participante de teste criado: ${dadoTeste.nome} - Código: ${codigo}`);
                
            } catch (error) {
                logger.error(`Erro ao criar participante ${dadoTeste.nome}:`, error.message);
            }
        }
        
        logger.info(`Dados de teste carregados: ${importados} participantes`);
        
    } catch (error) {
        logger.error('Erro ao carregar dados de teste:', error);
    }
}

// Função para gerar código aleatório
function gerarCodigoAleatorio() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Rota para gerar nova URL
app.post('/api/gerar-rota', async (req, res) => {
    const codigo = gerarCodigoAleatorio();
    
    try {
        await pool.query('INSERT INTO rotas (codigo) VALUES ($1)', [codigo]);
        
        const url = `${req.protocol}://${req.get('host')}/${codigo}`;
        res.json({ codigo, url });
    } catch (err) {
        console.error('Erro ao gerar rota:', err);
        res.status(500).json({ error: 'Erro ao gerar rota' });
    }
});

// Painel administrativo (deve vir ANTES da rota dinâmica)
app.get('/admin', async (req, res) => {
    try {
        // Buscar estatísticas
        const totalConfirmacoes = await pool.query('SELECT COUNT(*) as count FROM confirmacoes');
        const webhooksEnviados = await pool.query('SELECT COUNT(*) as count FROM confirmacoes WHERE webhook_enviado = TRUE');
        const rotasGeradas = await pool.query('SELECT COUNT(*) as count FROM rotas');
        const rotasUsadas = await pool.query(`
            SELECT COUNT(DISTINCT r.codigo) as count 
            FROM rotas r 
            INNER JOIN confirmacoes c ON r.codigo = c.codigo_rota
        `);
        const participantesImportados = await pool.query('SELECT COUNT(*) as count FROM participantes_importados');
        
        const stats = {
            totalConfirmacoes: parseInt(totalConfirmacoes.rows[0].count),
            webhooksEnviados: parseInt(webhooksEnviados.rows[0].count),
            rotasGeradas: parseInt(rotasGeradas.rows[0].count),
            rotasUsadas: parseInt(rotasUsadas.rows[0].count),
            participantesImportados: parseInt(participantesImportados.rows[0].count)
        };
        
        logger.info('Estatísticas carregadas:', stats);
        
        res.render('admin', { stats });
    } catch (err) {
        logger.error('Erro ao buscar estatísticas:', err);
        res.status(500).send('Erro interno do servidor');
    }
});

// Rota dinâmica para confirmação (deve vir DEPOIS das rotas específicas)
app.get('/:codigo', async (req, res) => {
    const codigo = req.params.codigo.toUpperCase();
    
    try {
        // Verificar se o código existe
        const result = await pool.query('SELECT * FROM rotas WHERE codigo = $1', [codigo]);
        
        if (result.rows.length === 0) {
            return res.status(404).send('Código não encontrado');
        }
        
        // Registrar o acesso
        await pool.query('UPDATE rotas SET usado = TRUE WHERE codigo = $1', [codigo]);
        
        // Renderizar página de confirmação
        res.render('confirmacao', { codigo });
    } catch (err) {
        console.error('Erro ao buscar código:', err);
        res.status(500).send('Erro interno do servidor');
    }
});

// Rota para processar confirmação
app.post('/api/confirmar/:codigo', async (req, res) => {
    const codigo = req.params.codigo.toUpperCase();
    const { nome, telefone, email } = req.body;
    
    if (!nome || !telefone) {
        return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    }
    
    try {
        // Verificar se o código existe
        const rotaResult = await pool.query('SELECT * FROM rotas WHERE codigo = $1', [codigo]);
        
        if (rotaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Código não encontrado' });
        }
        
        // Salvar confirmação
        const confirmacaoResult = await pool.query(
            'INSERT INTO confirmacoes (codigo_rota, nome, telefone, email) VALUES ($1, $2, $3, $4) RETURNING id',
            [codigo, nome, telefone, email || null]
        );
        
        const confirmacaoId = confirmacaoResult.rows[0].id;
        
        // Enviar para webhook do n8n
        try {
            const webhookUrl = process.env.N8N_WEBHOOK_URL;
        
        if (!webhookUrl) {
        logger.error('N8N_WEBHOOK_URL não configurado no .env');
            return res.status(500).json({ 
                success: false, 
                message: 'Webhook não configurado' 
            });
        }
            const mensagem = `🎉 *Confirmação de Participação - CapacitIA*

Olá ${nome}! Sua participação foi confirmada com sucesso!

📚 *Treinamento CapacitIA – Autonomia Digital para Pessoas Idosas*
🏛️ Promovido pela Secretaria de Inteligência Artificial

📅 *Datas:* 14 e 16 de outubro de 2025 (terça e quinta-feira)
🕗 *Horário:* 08h às 12h
📍 *Local:* Espaço da Cidadania Digital
📍 *Endereço:* R. Clodoaldo Freitas, 729 - Centro (Norte), Teresina - PI, 64000-360 (próximo ao Lindolfo Monteiro)

Aguardamos você! 🚀`;

            await axios.post(webhookUrl, {
                mensagem: mensagem,
                telefone: telefone,
                nome: nome,
                email: email || '',
                codigo: codigo
            });
            
            // Marcar webhook como enviado
            await pool.query('UPDATE confirmacoes SET webhook_enviado = TRUE WHERE id = $1', [confirmacaoId]);
            
        } catch (webhookError) {
            console.error('Erro ao enviar webhook:', webhookError.message);
        }
        
        res.json({ 
            success: true, 
            message: 'Confirmação realizada com sucesso!',
            id: confirmacaoId 
        });
        
    } catch (err) {
        console.error('Erro ao processar confirmação:', err);
        res.status(500).json({ error: 'Erro ao salvar confirmação' });
    }
});

// Buscar dados do participante pelo código
app.get('/api/participante/:codigo', async (req, res) => {
    const codigo = req.params.codigo.toUpperCase();
    
    try {
        // Buscar dados do participante usando INNER JOIN com a tabela rotas
        const participanteResult = await pool.query(`
            SELECT p.nome, p.telefone, p.email 
            FROM participantes_importados p
            INNER JOIN rotas r ON r.participante_id = p.id
            WHERE r.codigo = $1
        `, [codigo]);
        
        if (participanteResult.rows.length > 0) {
            res.json(participanteResult.rows[0]);
        } else {
            return res.status(404).json({ error: 'Código não encontrado' });
        }
        
    } catch (err) {
        console.error('Erro ao buscar participante:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Listar confirmações
app.get('/api/confirmacoes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, r.codigo as rota_codigo, r.criado_em as rota_criada_em
            FROM confirmacoes c 
            LEFT JOIN rotas r ON c.codigo_rota = r.codigo 
            ORDER BY c.confirmado_em DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar confirmações:', err);
        res.status(500).json({ error: 'Erro ao buscar confirmações' });
    }
});

// Buscar participantes disponíveis para envio
app.get('/api/participantes-envio', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id,
                p.nome,
                p.telefone,
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
        `);
        
        res.json(result.rows);
    } catch (err) {
        logger.error('Erro ao buscar participantes para envio:', err);
        res.status(500).json({ error: 'Erro ao buscar participantes' });
    }
});

// Enviar mensagens de confirmação para participantes selecionados
app.post('/api/enviar-mensagens', async (req, res) => {
    try {
        const { baseUrl, participantesSelecionados } = req.body;
        
        // Usar a URL do webhook do arquivo .env
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        
        if (!webhookUrl) {
            logger.error('N8N_WEBHOOK_URL não configurado no .env');
            return res.status(500).json({ 
                success: false, 
                message: 'Webhook não configurado no arquivo .env' 
            });
        }
        
        if (!baseUrl) {
            return res.status(400).json({ error: 'URL base é obrigatória' });
        }
        
        if (!participantesSelecionados || !Array.isArray(participantesSelecionados) || participantesSelecionados.length === 0) {
            return res.status(400).json({ error: 'Nenhum participante selecionado' });
        }
        
        // Buscar apenas os participantes selecionados
        const placeholders = participantesSelecionados.map((_, index) => `$${index + 1}`).join(',');
        const result = await pool.query(`
            SELECT 
                p.id,
                p.nome,
                p.telefone,
                r.codigo
            FROM participantes_importados p
            INNER JOIN rotas r ON r.participante_id = p.id
            WHERE p.id IN (${placeholders}) AND p.telefone IS NOT NULL AND p.telefone != ''
            ORDER BY p.nome
        `, participantesSelecionados);
        
        const participantes = result.rows;
        
        if (participantes.length === 0) {
            return res.status(400).json({ error: 'Nenhum participante válido encontrado entre os selecionados' });
        }
        
        let enviados = 0;
        let erros = 0;
        const detalhesEnvio = [];
        
        for (const participante of participantes) {
            try {
                const urlConfirmacao = `${baseUrl}/${participante.codigo}`;
                const mensagem = `Olá, ${participante.nome}! Tudo bem? 😄

Gostaríamos de confirmar sua participação no treinamento CapacitIA – Autonomia Digital para Pessoas Idosas, promovido pela Secretaria de Inteligência Artificial.

Por favor, confirme sua presença no link: ${urlConfirmacao}`;

                // Enviar via webhook n8n
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        telefone: participante.telefone,
                        mensagem: mensagem,
                        nome: participante.nome,
                        codigo: participante.codigo,
                        urlConfirmacao: urlConfirmacao
                    })
                });
                
                if (response.ok) {
                    enviados++;
                    detalhesEnvio.push({
                        nome: participante.nome,
                        telefone: participante.telefone,
                        codigo: participante.codigo,
                        status: 'enviado'
                    });
                } else {
                    console.error(`Erro ao enviar mensagem para ${participante.nome}:`, response.statusText);
                    erros++;
                    detalhesEnvio.push({
                        nome: participante.nome,
                        telefone: participante.telefone,
                        codigo: participante.codigo,
                        status: 'erro',
                        erro: response.statusText
                    });
                }
                
                // Pequena pausa entre envios para não sobrecarregar
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (err) {
                console.error(`Erro ao enviar mensagem para ${participante.nome}:`, err);
                erros++;
                detalhesEnvio.push({
                    nome: participante.nome,
                    telefone: participante.telefone,
                    codigo: participante.codigo,
                    status: 'erro',
                    erro: err.message
                });
            }
        }
        
        res.json({
            success: true,
            message: `${enviados} mensagens enviadas com sucesso! ${erros} erros.`,
            enviados,
            erros,
            total: participantes.length,
            detalhes: detalhesEnvio
        });
        
    } catch (err) {
        console.error('Erro ao enviar mensagens:', err);
        res.status(500).json({ error: 'Erro ao enviar mensagens' });
    }
});

// Importar dados de teste (apenas para desenvolvimento)
app.post('/api/importar-dados-teste', async (req, res) => {
    try {
        console.log('🧪 Iniciando importação de dados de teste...');
        
        // Limpar dados de teste existentes na ordem correta (respeitando foreign keys)
        await pool.query('DELETE FROM confirmacoes WHERE codigo_rota LIKE \'TESTE_%\'');
        await pool.query('DELETE FROM rotas WHERE codigo LIKE \'TESTE_%\'');
        await pool.query('DELETE FROM participantes_importados WHERE nome IN (\'Marina\')');
        
        let importados = 0;
        let erros = 0;
        
        // Dados de teste - removendo duplicação do Alexandre
        const dadosTeste = [
            {
                nome: 'Marina',
                telefone: '86999503015',
                email: 'marina@teste.com'
            }
        ];
        
        for (const dadoTeste of dadosTeste) {
            try {
                // Inserir participante de teste com estrutura simplificada
                const participanteResult = await pool.query(`
                    INSERT INTO participantes_importados 
                    (nome, telefone, email) 
                    VALUES ($1, $2, $3)
                    RETURNING id
                `, [
                    dadoTeste.nome,
                    dadoTeste.telefone,
                    dadoTeste.email
                ]);
                
                const participanteId = participanteResult.rows[0].id;
                
                // Gerar código único para o teste
                const codigo = 'TESTE_' + gerarCodigoAleatorio();
                
                // Inserir na tabela rotas
                await pool.query(`
                    INSERT INTO rotas (codigo, participante_id) 
                    VALUES ($1, $2)
                `, [codigo, participanteId]);
                
                importados++;
                console.log(`✅ Participante de teste criado: ${dadoTeste.nome} - Código: ${codigo}`);
                
            } catch (error) {
                console.error(`❌ Erro ao criar participante ${dadoTeste.nome}:`, error.message);
                erros++;
            }
        }
        
        console.log(`📊 Importação de teste concluída: ${importados} importados, ${erros} erros`);
        
        res.json({
            success: true,
            message: `Dados de teste importados com sucesso!`,
            importados,
            erros
        });
        
    } catch (error) {
        console.error('❌ Erro na importação de dados de teste:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Importar dados do table.json e gerar códigos únicos para cada participante
app.post('/api/admin/importar', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const tableJsonPath = path.join(__dirname, 'table.json');
        
        if (!fs.existsSync(tableJsonPath)) {
            return res.status(404).json({ error: 'Arquivo table.json não encontrado' });
        }
        
        const data = JSON.parse(fs.readFileSync(tableJsonPath, 'utf8'));
        
        // Limpar dados existentes (ordem correta para evitar violação de foreign key)
        await pool.query('DELETE FROM confirmacoes');
        await pool.query('DELETE FROM rotas');
        await pool.query('DELETE FROM participantes_importados');
        
        let importados = 0;
        let erros = 0;
        
        // Inserir novos dados e gerar códigos únicos
        for (const item of data) {
            try {
                const nome = item["Digite seu nome sem abreviar"];
                const telefone = item["Telefone/Celular/WhatsApp"];
                const email = item["E-mail (se houver)"] || '';
                
                if (!nome || !telefone) {
                    erros++;
                    continue;
                }
                
                // Inserir participante
                const participanteResult = await pool.query(`
                    INSERT INTO participantes_importados 
                    (carimbo_data_hora, nome, genero, idade, cpf, cidade, bairro, aposentado, telefone, email, projeto_extensao, outro_projeto, autorizacao_dados, dificuldades) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    RETURNING id
                `, [
                    item["Carimbo de data/hora"],
                    nome,
                    item["Gênero"],
                    item["Idade"],
                    item["CPF"],
                    item["Cidade"],
                    item["Bairro"],
                    item["Você é aposentado(a)?"],
                    telefone,
                    email,
                    item["Você participa de qual projeto de extensão? "],
                    item["Caso você não seja de nenhum projeto citado acima. \n1. Diga de qual grupo você faz parte, se houver. \n2. Como soube do treinamento. \n3. Se inscrever para os dia 28 e 30 de outubro"],
                    item["Autorizo o tratamento dos meus dados pessoais pela SIA nos termos da Lei nº 13.709/2018 (LGPD)."],
                    item["Dentre esses temas, qual(is) você tem mais dificuldade"]
                ]);
                
                // Gerar código único para este participante
                let codigo;
                let codigoExiste = true;
                
                while (codigoExiste) {
                    codigo = gerarCodigoAleatorio();
                    const verificarCodigo = await pool.query('SELECT id FROM rotas WHERE codigo = $1', [codigo]);
                    codigoExiste = verificarCodigo.rows.length > 0;
                }
                
                // Criar rota para este participante
                await pool.query(
                    'INSERT INTO rotas (codigo, participante_id) VALUES ($1, $2)',
                    [codigo, participanteResult.rows[0].id]
                );
                
                importados++;
                
            } catch (err) {
                console.error('Erro ao processar participante:', err);
                erros++;
            }
        }
        
        res.json({ 
            success: true, 
            message: `${importados} participantes importados com códigos únicos gerados! ${erros} erros.`,
            importados,
            erros
        });
        
    } catch (err) {
        console.error('Erro ao importar dados:', err);
        res.status(500).json({ error: 'Erro ao importar dados' });
    }
});

// Reenviar webhook
app.post('/api/reenviar-webhook/:id', async (req, res) => {
    try {
        const confirmacaoId = req.params.id;
        
        const result = await pool.query('SELECT * FROM confirmacoes WHERE id = $1', [confirmacaoId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Confirmação não encontrada' });
        }
        
        const confirmacao = result.rows[0];
        
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        
        if (!webhookUrl) {
            console.error('❌ N8N_WEBHOOK_URL não configurado no .env');
            return res.status(500).json({ 
                success: false, 
                message: 'Webhook não configurado' 
            });
        }
        const mensagem = `🎉 *Confirmação de Participação - CapacitIA*

Olá ${confirmacao.nome}! Sua participação foi confirmada com sucesso!

📚 *Treinamento CapacitIA – Autonomia Digital para Pessoas Idosas*
🏛️ Promovido pela Secretaria de Inteligência Artificial

📅 *Datas:* 14 e 16 de outubro de 2025 (terça e quinta-feira)
🕗 *Horário:* 08h às 12h
📍 *Local:* Espaço da Cidadania Digital
📍 *Endereço:* R. Clodoaldo Freitas, 729 - Centro (Norte), Teresina - PI, 64000-360 (próximo ao Lindolfo Monteiro)

Aguardamos você! 🚀`;

        await axios.post(webhookUrl, {
            mensagem: mensagem,
            telefone: confirmacao.telefone,
            nome: confirmacao.nome,
            email: confirmacao.email || '',
            codigo: confirmacao.codigo_rota
        });
        
        // Marcar webhook como enviado
        await pool.query('UPDATE confirmacoes SET webhook_enviado = TRUE WHERE id = $1', [confirmacaoId]);
        
        res.json({ success: true, message: 'Webhook reenviado com sucesso!' });
    } catch (err) {
        console.error('Erro ao reenviar webhook:', err);
        res.status(500).json({ error: 'Erro ao reenviar webhook' });
    }
});

// Iniciar servidor
app.listen(PORT, async () => {
    logger.info(`Servidor rodando na porta ${PORT}`);
    logger.info(`Acesse: ${process.env.APP_BASE_URL || `http://localhost:${PORT}`}`);
    logger.info(`Admin: ${process.env.APP_BASE_URL || `http://localhost:${PORT}`}/admin`);
    
    // Inicializar banco de dados
    await initDatabase();
});

module.exports = app;