require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

// Importar módulos organizados
const { testConnection, pool } = require('./database/connection');
const { initializeDatabase, carregarDadosTeste } = require('./database/init');
const { rotasQueries, confirmacoesQueries, participantesQueries } = require('./database/queries');
const mensagensQueries = require('./database/mensagensQueries');
const ParticipantService = require('./services/participantService');

const app = express();
const PORT = process.env.PORT || 3000;

// Função simples para hash de senha usando crypto nativo
function hashPassword(password) {
    return crypto.createHash('sha256').update(password + process.env.SALT || 'default_salt').digest('hex');
}

// Middleware de autenticação para admin
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Acesso negado');
    }
    
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');
    
    if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Credenciais inválidas');
    }
}

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

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Função para gerar código aleatório
function gerarCodigoAleatorio() {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
}

// Endpoint para gerar rota
app.post('/api/gerar-rota', async (req, res) => {
    try {
        const codigo = ParticipantService.generateUniqueCode();
        await rotasQueries.insertRota(codigo);
        
        logger.info(`Nova rota gerada: ${codigo}`);
        res.json({ codigo });
    } catch (error) {
        logger.error('Erro ao gerar rota:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Painel administrativo
app.get('/admin', requireAuth, async (req, res) => {
    try {
        const stats = {
            rotas: await rotasQueries.countRotas(),
            rotasUsadas: await rotasQueries.countRotasUsadas(),
            confirmacoes: await confirmacoesQueries.countConfirmacoes(),
            webhooksEnviados: await confirmacoesQueries.countWebhooksEnviados(),
            participantes: await participantesQueries.countParticipantes()
        };
        
        const confirmacoes = await confirmacoesQueries.listAll();
        
        res.render('admin', { 
            stats: {
                rotas: parseInt(stats.rotas.rows[0].count),
                rotasUsadas: parseInt(stats.rotasUsadas.rows[0].count),
                confirmacoes: parseInt(stats.confirmacoes.rows[0].count),
                webhooksEnviados: parseInt(stats.webhooksEnviados.rows[0].count),
                participantes: parseInt(stats.participantes.rows[0].count)
            },
            confirmacoes: confirmacoes.rows
        });
    } catch (error) {
        logger.error('Erro ao carregar painel admin:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Rota principal - formulário de confirmação
app.get('/:codigo', async (req, res) => {
    const codigo = req.params.codigo;
    
    try {
        const result = await rotasQueries.findByCodigo(codigo);
        
        if (result.rows.length === 0) {
            return res.status(404).render('erro', { 
                titulo: 'Código não encontrado',
                mensagem: 'O código informado não foi encontrado em nossa base de dados.' 
            });
        }
        
        const rota = result.rows[0];
        
        if (rota.usado) {
            // Buscar informações do treinamento do banco
            const infoTreinamento = await mensagensQueries.buscarPorTipo('info_treinamento');
            let dadosTreinamento = {};
            
            if (infoTreinamento) {
                try {
                    dadosTreinamento = JSON.parse(infoTreinamento.conteudo);
                } catch (error) {
                    logger.error('Erro ao parsear dados do treinamento:', error);
                    // Usar dados padrão em caso de erro
                    dadosTreinamento = {
                        nome_evento: 'CapacitIA – Autonomia Digital para Pessoas Idosas',
                        local: 'Espaço da Cidadania Digital',
                        endereco: 'R. Clodoaldo Freitas, 729 - Centro (Norte), Teresina - PI, 64000-360 (próx. ao Lindolfo Monteiro)',
                        dias: '14 e 16 de outubro de 2025 (terça e quinta)',
                        horario: '08h às 12h',
                        mensagem_final: 'Aguardamos você no treinamento!'
                    };
                }
            }
            
            return res.render('ja-confirmado', { codigo, treinamento: dadosTreinamento });
        }
        
        // Buscar informações do treinamento do banco
        const infoTreinamento = await mensagensQueries.buscarPorTipo('info_treinamento');
        let dadosTreinamento = {};
        
        if (infoTreinamento) {
            try {
                dadosTreinamento = JSON.parse(infoTreinamento.conteudo);
            } catch (error) {
                logger.error('Erro ao parsear dados do treinamento:', error);
                // Usar dados padrão em caso de erro
                dadosTreinamento = {
                    nome_evento: 'CapacitIA – Autonomia Digital para Pessoas Idosas',
                    local: 'Espaço da Cidadania Digital',
                    endereco: 'R. Clodoaldo Freitas, 729 - Centro (Norte), Teresina - PI, 64000-360 (próx. ao Lindolfo Monteiro)',
                    dias: '14 e 16 de outubro de 2025 (terça e quinta)',
                    horario: '08h às 12h',
                    mensagem_final: 'Aguardamos você no treinamento!'
                };
            }
        }

        let participante = null;
        if (rota.participante_id) {
            const participanteResult = await participantesQueries.findByCodigo(codigo);
            if (participanteResult.rows.length > 0) {
                participante = participanteResult.rows[0];
            }
        }
        
        res.render('confirmacao', { codigo, participante, treinamento: dadosTreinamento });
    } catch (error) {
        logger.error('Erro ao buscar código:', error);
        res.status(500).render('erro', { 
            titulo: 'Erro interno',
            mensagem: 'Ocorreu um erro interno. Tente novamente mais tarde.' 
        });
    }
});

// Processar confirmação
app.post('/api/confirmar/:codigo', async (req, res) => {
    const codigo = req.params.codigo;
    const { nome, telefone, email } = req.body;
    
    logger.debug(`Tentativa de confirmação - Código: ${codigo}, Nome: ${nome}, Telefone: ${telefone}, Email: ${email}`);
    
    if (!nome || !telefone) {
        logger.warn(`Dados obrigatórios faltando - Nome: ${nome}, Telefone: ${telefone}`);
        return res.status(400).json({ 
            success: false, 
            message: 'Nome e telefone são obrigatórios.' 
        });
    }
    
    try {
        logger.debug(`Buscando rota com código: ${codigo}`);
        const rotaResult = await rotasQueries.findByCodigo(codigo);
        
        if (rotaResult.rows.length === 0) {
            logger.warn(`Código não encontrado: ${codigo}`);
            return res.status(404).json({ 
                success: false, 
                message: 'Código não encontrado.' 
            });
        }
        
        const rota = rotaResult.rows[0];
        logger.debug(`Rota encontrada:`, rota);
        
        if (rota.usado) {
            logger.warn(`Código já utilizado: ${codigo}`);
            return res.status(400).json({ 
                success: false, 
                message: 'Este código já foi utilizado.' 
            });
        }
        
        logger.debug(`Inserindo confirmação no banco de dados`);
        const confirmacaoResult = await confirmacoesQueries.insertConfirmacao(codigo, nome, telefone, email);
        const confirmacaoId = confirmacaoResult.rows[0].id;
        logger.debug(`Confirmação inserida com ID: ${confirmacaoId}`);
        
        logger.debug(`Marcando código como usado: ${codigo}`);
        await rotasQueries.markAsUsed(codigo);
        
        // Enviar webhook
        try {
            const webhookUrl = process.env.N8N_WEBHOOK_URL;
            if (webhookUrl) {
                logger.debug(`Enviando webhook para: ${webhookUrl}`);
                const webhookData = {
                    id: confirmacaoId,
                    codigo_rota: codigo,
                    nome,
                    telefone,
                    email,
                    confirmado_em: new Date().toISOString()
                };
                logger.debug(`Dados do webhook:`, webhookData);
                
                const response = await axios.post(webhookUrl, webhookData);
                logger.debug(`Resposta do webhook:`, { status: response.status, data: response.data });
                
                await confirmacoesQueries.markWebhookSent(confirmacaoId);
                logger.info(`Webhook enviado para confirmação ${confirmacaoId}`);
                
                // Buscar mensagem de confirmação do banco de dados
                const mensagemConfirmacaoResult = await mensagensQueries.buscarPorTipo('confirmacao_whatsapp');
                let mensagemConfirmacao;
                
                if (mensagemConfirmacaoResult && mensagemConfirmacaoResult.conteudo) {
                    // Buscar informações do treinamento para substituir variáveis
                    const infoTreinamentoResult = await mensagensQueries.buscarPorTipo('info_treinamento');
                    let dadosTreinamento = {};
                    
                    if (infoTreinamentoResult && infoTreinamentoResult.conteudo) {
                        try {
                            dadosTreinamento = JSON.parse(infoTreinamentoResult.conteudo);
                        } catch (e) {
                            logger.warn('Erro ao parsear dados do treinamento, usando valores padrão');
                            dadosTreinamento = {
                                local: 'R. Clodoaldo Freitas, 729 - Centro (Norte), Teresina - PI, 64000-360 (próx. ao Lindolfo Monteiro)',
                                dias: '14 e 16 de outubro de 2025 (terça e quinta)',
                                horario: '08h às 12h'
                            };
                        }
                    }
                    
                    // Substituir variáveis na mensagem
                    mensagemConfirmacao = mensagemConfirmacaoResult.conteudo
                        .replace(/{nome}/g, nome)
                        .replace(/{local}/g, dadosTreinamento.local || 'R. Clodoaldo Freitas, 729 - Centro (Norte), Teresina - PI, 64000-360 (próx. ao Lindolfo Monteiro)')
                        .replace(/{dias}/g, dadosTreinamento.dias || '14 e 16 de outubro de 2025 (terça e quinta)')
                        .replace(/{horario}/g, dadosTreinamento.horario || '08h às 12h');
                } else {
                    // Fallback para mensagem hardcoded se não encontrar no banco
                    logger.warn('Mensagem de confirmação não encontrada no banco, usando fallback');
                    mensagemConfirmacao = `Olá, ${nome}! 🎉

Que alegria ter você conosco! 💛
Sua participação no *treinamento CapacitIA – Autonomia Digital* para Pessoas Idosas foi confirmada com sucesso! 🙌

📍 Local: R. Clodoaldo Freitas, 729 – Centro (Norte), Teresina-PI
(próx. ao Estádio Lindolfo Monteiro)

📅 Dias: 21 e 23 de outubro de 2025 (terça e quinta)
🕗 Horário: 08h às 12h

O curso será *leve, acolhedor e com muita prática, pra você aprender de forma simples, divertida e no seu ritmo!* 💻✨

Estamos muito felizes em receber você! 😊`;
                }

                logger.debug(`Enviando segunda mensagem de confirmação`);
                const segundaResponse = await axios.post(webhookUrl, {
                    telefone,
                    mensagem: mensagemConfirmacao,
                    participante_id: confirmacaoId,
                    codigo: codigo,
                    tipo: 'confirmacao'
                });
                
                logger.info(`Segunda mensagem enviada para ${nome} (${telefone})`);
                logger.debug(`Resposta da segunda mensagem:`, { status: segundaResponse.status, data: segundaResponse.data });
            } else {
                logger.warn('URL do webhook não configurada');
            }
        } catch (webhookError) {
            logger.error('Erro ao enviar webhook:', webhookError.message);
            logger.debug('Detalhes do erro do webhook:', webhookError);
        }
        
        logger.info(`Confirmação processada: ${nome} - ${telefone} - Código: ${codigo}`);
        res.json({ success: true, message: 'Confirmação realizada com sucesso!' });
    } catch (error) {
        logger.error('Erro ao processar confirmação:', error.message);
        logger.debug('Stack trace do erro:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao processar confirmação: ' + error.message 
        });
    }
});

// Processar recusa de participação
app.post('/api/recusar/:codigo', async (req, res) => {
    const codigo = req.params.codigo;
    const { nome, telefone, email } = req.body;
    
    logger.debug(`Tentativa de recusa - Código: ${codigo}, Nome: ${nome}, Telefone: ${telefone}, Email: ${email}`);
    
    if (!nome || !telefone) {
        logger.warn(`Dados obrigatórios faltando - Nome: ${nome}, Telefone: ${telefone}`);
        return res.status(400).json({ 
            success: false, 
            message: 'Nome e telefone são obrigatórios.' 
        });
    }
    
    try {
        logger.debug(`Buscando rota com código: ${codigo}`);
        const rotaResult = await rotasQueries.findByCodigo(codigo);
        
        if (rotaResult.rows.length === 0) {
            logger.warn(`Código não encontrado: ${codigo}`);
            return res.status(404).json({ 
                success: false, 
                message: 'Código não encontrado.' 
            });
        }
        
        const rota = rotaResult.rows[0];
        logger.debug(`Rota encontrada:`, rota);
        
        if (rota.usado) {
            logger.warn(`Código já utilizado: ${codigo}`);
            return res.status(400).json({ 
                success: false, 
                message: 'Este código já foi utilizado.' 
            });
        }
        
        logger.debug(`Marcando código como usado: ${codigo}`);
        await rotasQueries.markAsUsed(codigo);
        
        // Enviar webhook para recusa
        try {
            const webhookUrl = process.env.N8N_WEBHOOK_URL;
            if (webhookUrl) {
                logger.debug(`Enviando webhook de recusa para: ${webhookUrl}`);
                
                // Buscar mensagem de recusa do banco de dados
                const mensagemRecusaResult = await mensagensQueries.buscarPorTipo('recusa_whatsapp');
                let mensagemRecusa;
                
                if (mensagemRecusaResult && mensagemRecusaResult.conteudo) {
                    // Substituir variáveis na mensagem
                    mensagemRecusa = mensagemRecusaResult.conteudo
                        .replace(/{nome}/g, nome);
                } else {
                    // Fallback para mensagem hardcoded se não encontrar no banco
                    logger.warn('Mensagem de recusa não encontrada no banco, usando fallback');
                    mensagemRecusa = `Olá, ${nome}! 😊

Obrigado por nos informar sobre sua disponibilidade. 💛

Entendemos que você não poderá participar do treinamento CapacitIA – Autonomia Digital para Pessoas Idosas nesta ocasião.

📢 *Fique atento às nossas próximas turmas!*
Você será sempre bem-vindo(a) em futuras oportunidades.

Para mais informações sobre nossos próximos treinamentos, acompanhe nossos canais de comunicação.`;
                }

                logger.debug(`Enviando mensagem de recusa`);
                const response = await axios.post(webhookUrl, {
                    telefone,
                    mensagem: mensagemRecusa,
                    codigo: codigo,
                    tipo: 'recusa',
                    nome: nome
                });
                
                logger.info(`Mensagem de recusa enviada para ${nome} (${telefone})`);
                logger.debug(`Resposta da mensagem de recusa:`, { status: response.status, data: response.data });
            } else {
                logger.warn('URL do webhook não configurada');
            }
        } catch (webhookError) {
            logger.error('Erro ao enviar webhook de recusa:', webhookError.message);
            logger.debug('Detalhes do erro do webhook:', webhookError);
        }
        
        logger.info(`Recusa processada: ${nome} - ${telefone} - Código: ${codigo}`);
        res.json({ success: true, message: 'Recusa registrada com sucesso!' });
    } catch (error) {
        logger.error('Erro ao processar recusa:', error.message);
        logger.debug('Stack trace do erro:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao processar recusa: ' + error.message 
        });
    }
});

// Buscar dados do participante por código
app.get('/api/participante/:codigo', async (req, res) => {
    const codigo = req.params.codigo;
    
    try {
        const participanteResult = await participantesQueries.findByCodigo(codigo);
        
        if (participanteResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Participante não encontrado para este código' 
            });
        }
        
        res.json({ 
            success: true, 
            participante: participanteResult.rows[0] 
        });
    } catch (error) {
        logger.error('Erro ao buscar participante:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
        });
    }
});

// Rota para verificar participantes
app.get('/api/admin/verificar-participantes', async (req, res) => {
    try {
        // Contar total de participantes
        const totalResult = await participantesQueries.countParticipantes();
        const total = totalResult.rows[0].count;
        
        // Buscar participantes sem rota
        const semRotaResult = await participantesQueries.findWithoutRoute();
        
        // Buscar últimos 10 participantes
        const query = `
            SELECT id, nome, telefone, carimbo_data_hora 
            FROM participantes_importados 
            ORDER BY id DESC 
            LIMIT 10
        `;
        const ultimosResult = await pool.query(query);
        
        res.json({
            success: true,
            total: parseInt(total),
            semRota: semRotaResult.rows.length,
            participantesSemRota: semRotaResult.rows,
            ultimosParticipantes: ultimosResult.rows
        });

    } catch (error) {
        logger.error('Erro ao verificar participantes:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao verificar participantes',
            details: error.message 
        });
    }
});

// Rota para importar novos participantes
app.post('/api/admin/importar-novos', async (req, res) => {
    try {
        const importService = require('./services/importService');
        const path = require('path');
        
        // Caminho do arquivo JSON
        const jsonFilePath = path.resolve(__dirname, '..', 'tableConvert.com_0oretq.json');
        
        logger.info('Iniciando importação de novos participantes...');
        const stats = await importService.importFromJson(jsonFilePath);
        
        res.json({
            success: true,
            message: 'Importação concluída',
            stats: stats
        });

    } catch (error) {
        logger.error('Erro na importação:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro durante a importação',
            details: error.message 
        });
    }
});

// Endpoint para sincronizar dados do Google Sheets
app.post('/api/admin/sincronizar-google-sheets', requireAuth, async (req, res) => {
    try {
        const googleSheetsService = require('./services/googleSheetsService');
        
        logger.info('Iniciando sincronização com Google Sheets...');
        
        // Obter dados da planilha
        const participantesSheet = await googleSheetsService.getParticipantsFromSheet();
        
        if (participantesSheet.length === 0) {
            return res.json({
                success: true,
                message: 'Nenhum novo participante encontrado na planilha',
                stats: {
                    total: 0,
                    novos: 0,
                    duplicados: 0,
                    erros: 0
                }
            });
        }
        
        logger.info(`Encontrados ${participantesSheet.length} participantes na planilha`);
        
        const stats = {
            total: participantesSheet.length,
            novos: 0,
            duplicados: 0,
            erros: 0,
            detalhes: []
        };
        
        // Processar cada participante
        for (const participante of participantesSheet) {
            try {
                // Mapear dados da planilha para estrutura da tabela
                const dadosMapeados = ParticipantService.mapGoogleSheetsToTableStructure(participante);
                
                // Verificar se já existe (por CPF ou telefone)
                const existeResult = await participantesQueries.checkDuplicates(
                    dadosMapeados.cpf, 
                    dadosMapeados.telefone
                );
                
                if (existeResult.rows.length > 0) {
                    stats.duplicados++;
                    stats.detalhes.push({
                        nome: dadosMapeados.nome,
                        status: 'duplicado',
                        motivo: 'CPF ou telefone já existe no banco'
                    });
                    continue;
                }
                
                // Inserir novo participante
                const resultado = await participantesQueries.insertParticipante(dadosMapeados);
                const participanteId = resultado.rows[0].id;
                
                // Criar rota para o participante
                await ParticipantService.createRouteForParticipant(participanteId);
                
                stats.novos++;
                stats.detalhes.push({
                    nome: dadosMapeados.nome,
                    status: 'inserido',
                    participanteId: participanteId
                });
                
            } catch (error) {
                stats.erros++;
                stats.detalhes.push({
                    nome: participante.nome || 'Nome não informado',
                    status: 'erro',
                    motivo: error.message
                });
                logger.error(`Erro ao processar participante ${participante.nome}:`, error);
            }
        }
        
        logger.info(`Sincronização concluída: ${stats.novos} novos, ${stats.duplicados} duplicados, ${stats.erros} erros`);
        
        res.json({
            success: true,
            message: `Sincronização concluída: ${stats.novos} novos participantes adicionados`,
            stats: stats
        });
        
    } catch (error) {
        logger.error('Erro na sincronização com Google Sheets:', error);
        res.status(500).json({
            success: false,
            message: 'Erro na sincronização: ' + error.message,
            details: error.stack
        });
    }
});

// Endpoint para gerar rotas para participantes sem rota
app.post('/api/admin/gerar-rotas-participantes', async (req, res) => {
    try {
        const results = await ParticipantService.createRoutesForParticipantsWithoutRoute();
        
        const sucessos = results.filter(r => r.success);
        const erros = results.filter(r => !r.success);
        
        logger.info(`Rotas geradas: ${sucessos.length} sucessos, ${erros.length} erros`);
        
        res.json({
            success: true,
            message: `${sucessos.length} rotas geradas com sucesso`,
            stats: {
                total: results.length,
                sucessos: sucessos.length,
                erros: erros.length,
                rotasGeradas: sucessos.map(s => ({
                    nome: s.nome,
                    codigo: s.codigo,
                    participanteId: s.participanteId
                })),
                errosDetalhes: erros.map(e => ({
                    nome: e.nome,
                    erro: e.error,
                    participanteId: e.participanteId
                }))
            }
        });
    } catch (error) {
        logger.error('Erro ao gerar rotas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar rotas: ' + error.message
        });
    }
});

// Listar confirmações
app.get('/api/confirmacoes', requireAuth, async (req, res) => {
    try {
        const confirmacoes = await confirmacoesQueries.listAll();
        res.json({ 
            success: true, 
            confirmacoes: confirmacoes.rows 
        });
    } catch (error) {
        logger.error('Erro ao listar confirmações:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
        });
    }
});

// Listar participantes para envio
// Listar participantes para envio
app.get('/api/participantes-envio', requireAuth, async (req, res) => {
    try {
        const { projeto } = req.query;
        
        let participantes;
        if (projeto && projeto !== '') {
            participantes = await ParticipantService.getParticipantsForSendingByProject(projeto);
        } else {
            participantes = await ParticipantService.getParticipantsForSending();
        }
        
        res.json({ 
            success: true, 
            participantes 
        });
    } catch (error) {
        logger.error('Erro ao listar participantes para envio:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
        });
    }
});

// Listar participantes com mensagens enviadas mas não confirmadas
app.get('/api/participantes-nao-confirmados', requireAuth, async (req, res) => {
    try {
        const participantes = await ParticipantService.getSentButNotConfirmed();
        
        res.json({ 
            success: true, 
            participantes 
        });
    } catch (error) {
        logger.error('Erro ao listar participantes não confirmados:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
        });
    }
});

// Enviar mensagens para participantes selecionados
app.post('/api/enviar-mensagens', requireAuth, async (req, res) => {
    try {
        // Aceitar tanto 'participantes' quanto 'participantesSelecionados' para compatibilidade
        const { participantes, participantesSelecionados, baseUrl } = req.body;
        const participanteIds = participantes || participantesSelecionados;
        
        logger.debug('Dados recebidos:', { participantes, participantesSelecionados, baseUrl });
        logger.debug('IDs dos participantes:', participanteIds);
        logger.debug('É array?', Array.isArray(participanteIds));
        
        if (!participanteIds || !Array.isArray(participanteIds) || participanteIds.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nenhum participante selecionado' 
            });
        }
        
        const participantesData = await ParticipantService.getSelectedParticipants(participanteIds);
        
        if (participantesData.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Nenhum participante encontrado' 
            });
        }
        
        const resultados = [];
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        
        for (const participante of participantesData) {
            try {
                // Buscar template de mensagem do banco
                const templateMensagem = await mensagensQueries.buscarPorTipo('convite_whatsapp');
                
                if (!templateMensagem) {
                    throw new Error('Template de mensagem não encontrado no banco de dados');
                }

                // Substituir variáveis no template
                let mensagem = templateMensagem.conteudo
                    .replace(/{nome}/g, participante.nome)
                    .replace(/{codigo}/g, participante.codigo)
                    .replace(/{baseUrl}/g, baseUrl);
                
                if (webhookUrl) {
                    logger.info(`Enviando requisição para webhook: ${webhookUrl}`);
                    logger.debug('Dados enviados:', {
                        telefone: participante.telefone,
                        mensagem,
                        participante_id: participante.id,
                        codigo: participante.codigo
                    });
                    
                    const response = await axios.post(webhookUrl, {
                        telefone: participante.telefone,
                        mensagem,
                        participante_id: participante.id,
                        codigo: participante.codigo
                    });
                    
                    logger.info(`Resposta do webhook: Status ${response.status}`);
                    logger.debug('Resposta completa:', response.data);
                } else {
                    logger.warn('URL do webhook N8N não configurada');
                }
                
                resultados.push({
                    participante_id: participante.id,
                    nome: participante.nome,
                    telefone: participante.telefone,
                    codigo: participante.codigo,
                    status: 'enviado',
                    mensagem
                });
                
                logger.info(`Mensagem enviada para ${participante.nome} (${participante.telefone})`);
            } catch (error) {
                logger.error(`Erro ao enviar mensagem para ${participante.nome}:`, error);
                resultados.push({
                    participante_id: participante.id,
                    nome: participante.nome,
                    telefone: participante.telefone,
                    codigo: participante.codigo,
                    status: 'erro',
                    erro: error.message
                });
            }
        }
        
        const enviados = resultados.filter(r => r.status === 'enviado').length;
        const erros = resultados.filter(r => r.status === 'erro').length;
        
        res.json({
            success: true,
            message: `Processamento concluído: ${enviados} enviados, ${erros} erros`,
            resultados,
            resumo: { enviados, erros, total: resultados.length }
        });
    } catch (error) {
        logger.error('Erro ao enviar mensagens:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor: ' + error.message 
        });
    }
});

// Endpoint para importar dados de teste
app.post('/api/importar-dados-teste', async (req, res) => {
    try {
        const { resetarBancoDados, initializeDatabase, carregarDadosTeste } = require('./database/init');
        
        // Resetar banco de dados completamente
        await resetarBancoDados();
        
        // Recriar tabelas
        await initializeDatabase();
        
        // Carregar novos dados de teste
        const codigoTeste = await carregarDadosTeste();
        
        logger.info('Dados de teste importados com sucesso');
        res.json({ 
            success: true, 
            message: 'Banco resetado e dados de teste importados com sucesso!',
            codigoTeste 
        });
    } catch (error) {
        logger.error('Erro ao importar dados de teste:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao importar dados de teste: ' + error.message 
        });
    }
});

// Endpoint para importar dados reais do arquivo JSON
app.post('/api/importar-dados-reais', requireAuth, async (req, res) => {
    try {
        const jsonFilePath = path.join(__dirname, '../table.json');
        
        logger.info('Iniciando importação de dados reais...');
        
        // Importar dados reais usando o ParticipantService
        const result = await ParticipantService.importRealData(jsonFilePath);
        
        if (result.success) {
            logger.info(`Importação concluída: ${result.successCount} sucessos, ${result.errorCount} erros`);
            res.json({
                success: true,
                message: `Importação concluída com sucesso! ${result.successCount} participantes importados, ${result.errorCount} erros.`,
                data: {
                    totalProcessed: result.totalProcessed,
                    successCount: result.successCount,
                    errorCount: result.errorCount,
                    results: result.results
                }
            });
        } else {
            logger.error('Erro na importação de dados reais:', result.error);
            res.status(500).json({
                success: false,
                message: 'Erro na importação: ' + result.error
            });
        }
    } catch (error) {
        logger.error('Erro ao importar dados reais:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao importar dados reais: ' + error.message
        });
    }
});

// Endpoint para importar participantes
app.post('/api/admin/importar', requireAuth, async (req, res) => {
    try {
        const { participantes } = req.body;
        
        if (!participantes || !Array.isArray(participantes)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Dados de participantes inválidos' 
            });
        }
        
        const processedParticipants = participantes.map(p => 
            ParticipantService.processParticipantForImport(p)
        );
        
        const results = await ParticipantService.importParticipants(processedParticipants);
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;
        
        logger.info(`Importação concluída: ${successCount} sucessos, ${errorCount} erros`);
        res.json({
            success: true,
            message: `Importação concluída: ${successCount} sucessos, ${errorCount} erros`,
            results
        });
    } catch (error) {
        logger.error('Erro ao importar participantes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao importar participantes: ' + error.message 
        });
    }
});

// Endpoint para reenviar webhook
// API para listar mensagens
app.get('/api/mensagens', requireAuth, async (req, res) => {
    try {
        const mensagens = await mensagensQueries.listarTodas();
        res.json({ success: true, mensagens });
    } catch (error) {
        logger.error('Erro ao listar mensagens:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// API para buscar mensagem por ID
app.get('/api/mensagens/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const mensagem = await pool.query('SELECT * FROM mensagens WHERE id = $1', [id]);
        
        if (mensagem.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Mensagem não encontrada' });
        }
        
        res.json({ success: true, mensagem: mensagem.rows[0] });
    } catch (error) {
        logger.error('Erro ao buscar mensagem:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// API para atualizar mensagem
app.put('/api/mensagens/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, conteudo, variaveis, motivo } = req.body;
        
        if (!titulo || !conteudo) {
            return res.status(400).json({ success: false, message: 'Título e conteúdo são obrigatórios' });
        }
        
        const mensagemAtualizada = await mensagensQueries.atualizar(
            id, 
            titulo, 
            conteudo, 
            variaveis ? JSON.stringify(variaveis) : null,
            'admin',
            motivo
        );
        
        res.json({ success: true, mensagem: mensagemAtualizada });
    } catch (error) {
        logger.error('Erro ao atualizar mensagem:', error);
        res.status(500).json({ success: false, message: error.message || 'Erro interno do servidor' });
    }
});

// API para buscar histórico de uma mensagem
app.get('/api/mensagens/:id/historico', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const historico = await mensagensQueries.buscarHistorico(id);
        res.json({ success: true, historico });
    } catch (error) {
        logger.error('Erro ao buscar histórico:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

app.post('/api/reenviar-webhook/:id', requireAuth, async (req, res) => {
    const confirmacaoId = req.params.id;
    
    try {
        const confirmacao = await confirmacoesQueries.findById(confirmacaoId);
        
        if (confirmacao.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Confirmação não encontrada' 
            });
        }
        
        const dados = confirmacao.rows[0];
        const webhookUrl = process.env.N8N_WEBHOOK_URL;
        
        if (!webhookUrl) {
            return res.status(400).json({ 
                success: false, 
                message: 'URL do webhook não configurada' 
            });
        }
        
        await axios.post(webhookUrl, {
            id: dados.id,
            codigo_rota: dados.codigo_rota,
            nome: dados.nome,
            telefone: dados.telefone,
            email: dados.email,
            confirmado_em: dados.confirmado_em
        });
        
        await confirmacoesQueries.markWebhookSent(confirmacaoId);
        
        logger.info(`Webhook reenviado para confirmação ${confirmacaoId}`);
        res.json({ 
            success: true, 
            message: 'Webhook reenviado com sucesso!' 
        });
    } catch (error) {
        logger.error('Erro ao reenviar webhook:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao reenviar webhook: ' + error.message 
        });
    }
});

// Inicializar aplicação
const initializeApp = async () => {
    try {
        logger.info('🔄 Inicializando aplicação...');
        
        // Testar conexão com banco
        await testConnection();
        
        // Inicializar banco de dados
        await initializeDatabase();
        
        // Carregar dados de teste se necessário
        await carregarDadosTeste();
        
        logger.info('✅ Aplicação inicializada com sucesso!');
    } catch (error) {
        logger.error('❌ Erro na inicialização:', error);
        throw error;
    }
};

// Função principal para iniciar o servidor
const startServer = async () => {
    try {
        // Inicializar aplicação (banco de dados, dados de teste, etc.)
        await initializeApp();
        
        // Iniciar servidor
        app.listen(PORT, () => {
            logger.info(`🚀 Servidor rodando na porta ${PORT}`);
            logger.info(`🌐 Acesse: http://localhost:${PORT}`);
            logger.info(`👨‍💼 Admin: http://localhost:${PORT}/admin`);
        });
    } catch (error) {
        logger.error('❌ Falha ao iniciar servidor:', error);
        process.exit(1);
    }
};

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    logger.error('❌ Erro não capturado:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Promise rejeitada não tratada:', reason);
    process.exit(1);
});

// Tratamento de sinais de encerramento
process.on('SIGINT', () => {
    logger.info('🛑 Recebido SIGINT. Encerrando servidor...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('🛑 Recebido SIGTERM. Encerrando servidor...');
    process.exit(0);
});

// Handler para Vercel (Serverless Functions)
let isInitialized = false;

const handler = async (req, res) => {
    try {
        // Inicializar apenas uma vez
        if (!isInitialized) {
            await initializeApp();
            isInitialized = true;
        }
        
        // Processar a requisição
        return app(req, res);
    } catch (error) {
        logger.error('❌ Erro no handler:', error);
        return res.status(500).json({ 
            error: 'Erro interno do servidor',
            message: error.message 
        });
    }
};

// Iniciar servidor apenas se este arquivo for executado diretamente
if (require.main === module) {
    startServer();
}

// Export para Vercel (default export)
module.exports = handler;
module.exports.default = handler;

// Export nomeado para compatibilidade
module.exports.app = app;
module.exports.initializeApp = initializeApp;
module.exports.logger = logger;
module.exports.PORT = PORT;