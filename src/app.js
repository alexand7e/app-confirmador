require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

// Importar módulos organizados
const { testConnection } = require('./database/connection');
const { initializeDatabase, carregarDadosTeste } = require('./database/init');
const { rotasQueries, confirmacoesQueries, participantesQueries } = require('./database/queries');
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
            return res.render('ja-confirmado', { codigo });
        }
        
        let participante = null;
        if (rota.participante_id) {
            const participanteResult = await participantesQueries.findByCodigo(codigo);
            if (participanteResult.rows.length > 0) {
                participante = participanteResult.rows[0];
            }
        }
        
        res.render('confirmacao', { codigo, participante });
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
                
                // Enviar segunda mensagem de confirmação
                const mensagemConfirmacao = `Olá, ${nome}! 🎉

Sua participação no treinamento CapacitIA foi confirmada com sucesso!

📍 Endereço: R. Clodoaldo Freitas, 729 - Centro (Norte), Teresina - PI, 64000-360 (próx. ao Lindolfo Monteiro)

📅 Dias: 14 e 16 de outubro de 2025 (terça e quinta)
🕗 Horário: 08h às 12h

Aguardamos você! 😊 Certo!`;

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
app.get('/api/participantes-envio', requireAuth, async (req, res) => {
    try {
        const participantes = await ParticipantService.getParticipantsForSending();
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
                const mensagem = `Olá, ${participante.nome}! Tudo bem? 😄

Gostaríamos de confirmar sua participação no treinamento CapacitIA – Autonomia Digital para Pessoas Idosas, promovido pela Secretaria de Inteligência Artificial.

📅 Dias: 14 e 16 de outubro de 2025 (terça e quinta)
🕗 Horário: 08h às 12h
📍 Local: Espaço da Cidadania Digital

Por favor, confirme sua presença no link: ${baseUrl}/${participante.codigo}`;
                
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
        const { limparDadosTeste } = require('./database/init');
        
        // Limpar dados de teste existentes
        await limparDadosTeste();
        
        // Carregar novos dados de teste
        const codigoTeste = await carregarDadosTeste();
        
        logger.info('Dados de teste importados com sucesso');
        res.json({ 
            success: true, 
            message: 'Dados de teste importados com sucesso!',
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

// Iniciar servidor apenas se este arquivo for executado diretamente
if (require.main === module) {
    startServer();
}

module.exports = { app, initializeApp, logger, PORT };