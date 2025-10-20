const fs = require('fs');
const path = require('path');
const { participantesQueries } = require('../database/queries');

class ImportService {
    constructor() {
        this.importStats = {
            total: 0,
            imported: 0,
            duplicates: 0,
            errors: 0,
            duplicateDetails: []
        };
    }

    // Mapear dados do JSON para estrutura da tabela
    mapJsonToTableStructure(jsonData) {
        // Limpar e formatar CPF
        let cpf = jsonData['CPF'] || '';
        cpf = cpf.replace(/\D/g, ''); // Remove tudo que não é dígito
        
        // Limpar e formatar telefone
        let telefone = jsonData['Telefone/Celular/WhatsApp'] || '';
        telefone = telefone.replace(/\D/g, ''); // Remove tudo que não é dígito
        
        // Processar idade
        let idade = null;
        const idadeStr = jsonData['Idade'];
        if (idadeStr && !isNaN(idadeStr)) {
            idade = parseInt(idadeStr);
        }

        // Processar data/hora
        let carimboDataHora = null;
        const dataStr = jsonData['Carimbo de data/hora'];
        if (dataStr) {
            // Tentar converter diferentes formatos de data
            const data = new Date(dataStr);
            if (!isNaN(data.getTime())) {
                carimboDataHora = data;
            }
        }

        return {
            carimbo_data_hora: carimboDataHora,
            nome: jsonData['Digite seu nome sem abreviar'] || '',
            genero: jsonData['Gênero'] || '',
            idade: idade,
            cpf: cpf,
            cidade: jsonData['Cidade'] || '',
            bairro: jsonData['Bairro'] || '',
            aposentado: jsonData['Você é aposentado(a)?'] || '',
            telefone: telefone,
            email: jsonData['E-mail (se houver)'] || '',
            projeto_extensao: jsonData['Você participa de qual projeto de extensão?'] || '',
            outro_projeto: jsonData['Caso você não seja de nenhum projeto citado acima. \n1. Diga de qual grupo você faz parte, se houver. \n2. Como soube do treinamento. \n3. Se inscrever para os dia 28 e 30 de outubro'] || '',
            autorizacao_dados: jsonData['Autorizo o tratamento dos meus dados pessoais pela SIA nos termos da Lei nº 13.709/2018 (LGPD).'] || '',
            dificuldades: jsonData['Dentre esses temas, qual(is) você tem mais dificuldade'] || ''
        };
    }

    // Verificar se participante já existe
    async checkForDuplicates(participante) {
        try {
            const duplicates = await participantesQueries.checkDuplicates(
                participante.cpf, 
                participante.telefone
            );
            return duplicates.rows;
        } catch (error) {
            console.error('Erro ao verificar duplicatas:', error);
            return [];
        }
    }

    // Importar participantes do arquivo JSON
    async importFromJson(filePath) {
        try {
            console.log(`Iniciando importação do arquivo: ${filePath}`);
            
            // Verificar se arquivo existe
            if (!fs.existsSync(filePath)) {
                throw new Error(`Arquivo não encontrado: ${filePath}`);
            }

            // Ler e parsear JSON
            const jsonContent = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(jsonContent);

            if (!Array.isArray(jsonData)) {
                throw new Error('O arquivo JSON deve conter um array de participantes');
            }

            this.importStats.total = jsonData.length;
            console.log(`Total de registros a processar: ${this.importStats.total}`);

            // Processar cada participante
            for (let i = 0; i < jsonData.length; i++) {
                const rawData = jsonData[i];
                
                try {
                    // Mapear dados
                    const participante = this.mapJsonToTableStructure(rawData);
                    
                    // Validar dados essenciais
                    if (!participante.nome || !participante.cpf || !participante.telefone) {
                        console.log(`Registro ${i + 1}: Dados essenciais faltando (nome, CPF ou telefone)`);
                        this.importStats.errors++;
                        continue;
                    }

                    // Verificar duplicatas
                    const duplicates = await this.checkForDuplicates(participante);
                    
                    if (duplicates.length > 0) {
                        console.log(`Registro ${i + 1}: Participante já existe - ${participante.nome}`);
                        this.importStats.duplicates++;
                        this.importStats.duplicateDetails.push({
                            nome: participante.nome,
                            cpf: participante.cpf,
                            telefone: participante.telefone,
                            motivo: duplicates.map(d => d.tipo_duplicata).join(', ')
                        });
                        continue;
                    }

                    // Inserir participante
                    await participantesQueries.insertParticipante(participante);
                    this.importStats.imported++;
                    
                    console.log(`Registro ${i + 1}: Importado com sucesso - ${participante.nome}`);

                } catch (error) {
                    console.error(`Erro ao processar registro ${i + 1}:`, error.message);
                    this.importStats.errors++;
                }
            }

            // Relatório final
            console.log('\n=== RELATÓRIO DE IMPORTAÇÃO ===');
            console.log(`Total de registros: ${this.importStats.total}`);
            console.log(`Importados com sucesso: ${this.importStats.imported}`);
            console.log(`Duplicatas encontradas: ${this.importStats.duplicates}`);
            console.log(`Erros: ${this.importStats.errors}`);

            if (this.importStats.duplicateDetails.length > 0) {
                console.log('\n=== DUPLICATAS ENCONTRADAS ===');
                this.importStats.duplicateDetails.forEach((dup, index) => {
                    console.log(`${index + 1}. ${dup.nome} - CPF: ${dup.cpf} - Tel: ${dup.telefone} - Motivo: ${dup.motivo}`);
                });
            }

            return this.importStats;

        } catch (error) {
            console.error('Erro durante a importação:', error);
            throw error;
        }
    }

    // Resetar estatísticas
    resetStats() {
        this.importStats = {
            total: 0,
            imported: 0,
            duplicates: 0,
            errors: 0,
            duplicateDetails: []
        };
    }
}

module.exports = new ImportService();