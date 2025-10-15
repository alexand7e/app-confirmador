const { participantesQueries, rotasQueries } = require('../database/queries');
const crypto = require('crypto');

class ParticipantService {
    // Gerar código único para rota
    static generateUniqueCode() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }

    // Criar rota para participante
    static async createRouteForParticipant(participanteId) {
        let codigo;
        let exists = true;
        
        // Gerar código único
        while (exists) {
            codigo = this.generateUniqueCode();
            const result = await rotasQueries.checkCodigoExists(codigo);
            exists = result.rows.length > 0;
        }
        
        // Inserir rota
        await rotasQueries.insertRota(codigo, participanteId);
        return codigo;
    }

    // Importar participantes em lote
    static async importParticipants(participantesData) {
        const results = [];
        
        for (const participante of participantesData) {
            try {
                // Inserir participante
                const result = await participantesQueries.insertParticipante(participante);
                const participanteId = result.rows[0].id;
                
                // Criar rota para o participante
                const codigo = await this.createRouteForParticipant(participanteId);
                
                results.push({
                    success: true,
                    participanteId,
                    codigo,
                    nome: participante.nome
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    nome: participante.nome
                });
            }
        }
        
        return results;
    }

    // Buscar participantes para envio de mensagens
    static async getParticipantsForSending() {
        const result = await participantesQueries.listForSending();
        return result.rows;
    }

    // Buscar participantes para envio filtrados por projeto
    static async getParticipantsForSendingByProject(projetoExtensao) {
        const result = await participantesQueries.listForSendingByProject(projetoExtensao);
        return result.rows;
    }

    // Buscar participantes com mensagens enviadas mas não confirmadas
    static async getSentButNotConfirmed() {
        const result = await participantesQueries.listSentButNotConfirmed();
        return result.rows;
    }

    // Buscar participantes selecionados
    static async getSelectedParticipants(participanteIds) {
        if (!participanteIds || participanteIds.length === 0) {
            return [];
        }
        
        const result = await participantesQueries.findSelected(participanteIds);
        return result.rows;
    }

    // Buscar participantes sem rota
    static async getParticipantsWithoutRoute() {
        const result = await participantesQueries.findWithoutRoute();
        return result.rows;
    }

    // Criar rotas para participantes sem rota
    static async createRoutesForParticipantsWithoutRoute() {
        const participantes = await this.getParticipantsWithoutRoute();
        const results = [];
        
        for (const participante of participantes) {
            try {
                const codigo = await this.createRouteForParticipant(participante.id);
                results.push({
                    success: true,
                    participanteId: participante.id,
                    codigo,
                    nome: participante.nome
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    participanteId: participante.id,
                    nome: participante.nome
                });
            }
        }
        
        return results;
    }

    // Obter estatísticas dos participantes
    static async getParticipantStats() {
        const totalParticipantes = await participantesQueries.countParticipantes();
        const participantesSemRota = await this.getParticipantsWithoutRoute();
        
        return {
            total: parseInt(totalParticipantes.rows[0].count),
            semRota: participantesSemRota.length,
            comRota: parseInt(totalParticipantes.rows[0].count) - participantesSemRota.length
        };
    }

    // Validar dados do participante
    static validateParticipantData(participante) {
        const errors = [];
        
        if (!participante.nome || participante.nome.trim() === '') {
            errors.push('Nome é obrigatório');
        }
        
        if (!participante.telefone || participante.telefone.trim() === '') {
            errors.push('Telefone é obrigatório');
        }
        
        // Validar formato do telefone (básico)
        if (participante.telefone && !/^\d{10,11}$/.test(participante.telefone.replace(/\D/g, ''))) {
            errors.push('Formato de telefone inválido');
        }
        
        // Validar email se fornecido
        if (participante.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participante.email)) {
            errors.push('Formato de email inválido');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Processar dados de participante para importação
    static processParticipantForImport(rawData) {
        return {
            carimbo_data_hora: rawData.carimbo_data_hora || new Date(),
            nome: rawData.nome?.trim() || '',
            genero: rawData.genero?.trim() || null,
            idade: rawData.idade ? parseInt(rawData.idade) : null,
            cpf: rawData.cpf?.trim() || null,
            cidade: rawData.cidade?.trim() || null,
            bairro: rawData.bairro?.trim() || null,
            aposentado: rawData.aposentado?.trim() || null,
            telefone: rawData.telefone?.replace(/\D/g, '') || null,
            email: rawData.email?.trim() || null,
            projeto_extensao: rawData.projeto_extensao?.trim() || null,
            outro_projeto: rawData.outro_projeto?.trim() || null,
            autorizacao_dados: rawData.autorizacao_dados?.trim() || null,
            dificuldades: rawData.dificuldades?.trim() || null
        };
    }

    // Mapear dados do JSON real para a estrutura da tabela
    static mapJsonToTableStructure(jsonData) {
        // Converter data do formato brasileiro para timestamp
        const parseDate = (dateStr) => {
            if (!dateStr) return new Date();
            // Formato: "17/09/2025 17:05:18"
            const [datePart, timePart] = dateStr.split(' ');
            const [day, month, year] = datePart.split('/');
            const [hour, minute, second] = timePart.split(':');
            return new Date(year, month - 1, day, hour, minute, second);
        };

        // Extrair idade numérica
        const parseAge = (ageStr) => {
            if (!ageStr) return null;
            const match = ageStr.toString().match(/\d+/);
            return match ? parseInt(match[0]) : null;
        };

        // Limpar CPF
        const cleanCPF = (cpf) => {
            if (!cpf) return null;
            return cpf.replace(/\D/g, '');
        };

        // Limpar telefone
        const cleanPhone = (phone) => {
            if (!phone) return null;
            return phone.replace(/\D/g, '');
        };

        return {
            carimbo_data_hora: parseDate(jsonData["Carimbo de data/hora"]),
            nome: jsonData["Digite seu nome sem abreviar"]?.trim() || '',
            genero: jsonData["Gênero"]?.trim() || null,
            idade: parseAge(jsonData["Idade"]),
            cpf: cleanCPF(jsonData["CPF"]),
            cidade: jsonData["Cidade"]?.trim() || null,
            bairro: jsonData["Bairro"]?.trim() || null,
            aposentado: jsonData["Você é aposentado(a)?"]?.trim() || null,
            telefone: cleanPhone(jsonData["Telefone/Celular/WhatsApp"]),
            email: jsonData["E-mail (se houver)"]?.trim() || null,
            projeto_extensao: jsonData["Você participa de qual projeto de extensão? "]?.trim() || null,
            outro_projeto: jsonData["Caso você não seja de nenhum projeto citado acima. \n1. Diga de qual grupo você faz parte, se houver. \n2. Como soube do treinamento. \n3. Se inscrever para os dia 28 e 30 de outubro"]?.trim() || null,
            autorizacao_dados: jsonData["Autorizo o tratamento dos meus dados pessoais pela SIA nos termos da Lei nº 13.709/2018 (LGPD)."]?.trim() || null,
            dificuldades: jsonData["Dentre esses temas, qual(is) você tem mais dificuldade"]?.trim() || null
        };
    }

    // Importar dados reais do arquivo JSON
    static async importRealData(jsonFilePath) {
        try {
            const fs = require('fs');
            const path = require('path');
            
            // Ler arquivo JSON
            const fullPath = path.resolve(jsonFilePath);
            const jsonData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            
            console.log(`Iniciando importação de ${jsonData.length} participantes...`);
            
            const results = [];
            let successCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < jsonData.length; i++) {
                const rawParticipant = jsonData[i];
                
                try {
                    // Mapear dados para estrutura da tabela
                    const mappedData = this.mapJsonToTableStructure(rawParticipant);
                    
                    // Validar dados essenciais
                    if (!mappedData.nome || !mappedData.telefone) {
                        throw new Error('Nome e telefone são obrigatórios');
                    }
                    
                    // Inserir participante
                    const result = await participantesQueries.insertParticipante(mappedData);
                    const participanteId = result.rows[0].id;
                    
                    // Criar rota para o participante
                    const codigo = await this.createRouteForParticipant(participanteId);
                    
                    results.push({
                        success: true,
                        participanteId,
                        codigo,
                        nome: mappedData.nome,
                        telefone: mappedData.telefone
                    });
                    
                    successCount++;
                    console.log(`✓ Participante ${i + 1}/${jsonData.length}: ${mappedData.nome} - Código: ${codigo}`);
                    
                } catch (error) {
                    results.push({
                        success: false,
                        error: error.message,
                        nome: rawParticipant["Digite seu nome sem abreviar"] || 'Nome não informado',
                        index: i + 1
                    });
                    
                    errorCount++;
                    console.error(`✗ Erro no participante ${i + 1}/${jsonData.length}: ${error.message}`);
                }
            }
            
            console.log(`\nImportação concluída:`);
            console.log(`✓ Sucessos: ${successCount}`);
            console.log(`✗ Erros: ${errorCount}`);
            console.log(`Total: ${jsonData.length}`);
            
            return {
                success: true,
                totalProcessed: jsonData.length,
                successCount,
                errorCount,
                results
            };
            
        } catch (error) {
            console.error('Erro na importação:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = ParticipantService;