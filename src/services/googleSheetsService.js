const axios = require('axios');
const fs = require('fs');
const path = require('path');

class GoogleSheetsService {
    constructor() {
        this.credentials = null;
        this.accessToken = null;
        this.loadCredentials();
    }

    loadCredentials() {
        try {
            const credentialsPath = path.join(__dirname, '../../credentials.json');
            this.credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        } catch (error) {
            console.error('Erro ao carregar credentials.json:', error);
            throw new Error('Não foi possível carregar as credenciais do Google');
        }
    }

    async getAccessToken() {
        if (this.accessToken) {
            return this.accessToken;
        }

        try {
            const jwt = this.createJWT();
            
            const response = await axios.post('https://oauth2.googleapis.com/token', {
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            
            // Token expira em 1 hora, vamos limpar após 50 minutos
            setTimeout(() => {
                this.accessToken = null;
            }, 50 * 60 * 1000);

            return this.accessToken;
        } catch (error) {
            console.error('Erro ao obter access token:', error);
            throw new Error('Falha na autenticação com Google API');
        }
    }

    createJWT() {
        const crypto = require('crypto');
        
        const header = {
            alg: 'RS256',
            typ: 'JWT'
        };

        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: this.credentials.client_email,
            scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now
        };

        const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        
        const signatureInput = `${encodedHeader}.${encodedPayload}`;
        const signature = crypto.sign('RSA-SHA256', Buffer.from(signatureInput), this.credentials.private_key);
        const encodedSignature = signature.toString('base64url');

        return `${signatureInput}.${encodedSignature}`;
    }

    async readSheetData(spreadsheetId, range) {
        try {
            const accessToken = await this.getAccessToken();
            
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            return response.data.values || [];
        } catch (error) {
            console.error('Erro ao ler dados do Google Sheets:', error);
            throw new Error('Falha ao acessar Google Sheets');
        }
    }

    async getParticipantsFromSheet() {
        try {
            // ID da planilha extraído da URL fornecida
            const spreadsheetId = '1OE15NZqJjHtgVTIDh4ZQxku2wk2RQFXQb1jpJjnt3yA';
            
            // Primeiro, vamos tentar obter informações sobre a planilha
            const accessToken = await this.getAccessToken();
            
            // Verificar se a planilha existe e quais abas estão disponíveis
            const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
            
            try {
                const metadataResponse = await axios.get(metadataUrl, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                console.log('📊 Planilha encontrada:', metadataResponse.data.properties.title);
                console.log('📋 Abas disponíveis:', metadataResponse.data.sheets.map(sheet => sheet.properties.title));
                
                // Usar a primeira aba disponível
                const firstSheetName = metadataResponse.data.sheets[0].properties.title;
                const range = `${firstSheetName}!A:Z`;
                
                console.log('🔍 Tentando ler dados do range:', range);
                
                const data = await this.readSheetData(spreadsheetId, range);
                
                if (data.length === 0) {
                    console.log('⚠️ Nenhum dado encontrado na planilha');
                    return [];
                }

                // Primeira linha são os cabeçalhos
                const headers = data[0];
                const participants = [];

                console.log('📝 Cabeçalhos encontrados:', headers);

                // Processar cada linha de dados
                for (let i = 1; i < data.length; i++) {
                    const row = data[i];
                    const participant = {};
                    
                    // Mapear cada coluna para o cabeçalho correspondente
                    headers.forEach((header, index) => {
                        participant[header] = row[index] || '';
                    });

                    // Não adicionar data_incorporacao aqui - será definida no mapeamento
                    
                    participants.push(participant);
                }

                return participants;
                
            } catch (metadataError) {
                console.error('❌ Erro ao acessar metadados da planilha:', metadataError.response?.data || metadataError.message);
                throw new Error(`Erro ao acessar planilha: ${metadataError.response?.status || 'Desconhecido'}`);
            }
            
        } catch (error) {
            console.error('❌ Erro geral ao processar dados da planilha:', error);
            throw error;
        }
    }
}

module.exports = new GoogleSheetsService();