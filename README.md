# CapacitIA - Sistema de Confirmação de Participação

Sistema para gerenciar confirmações de participação no treinamento "CapacitIA – Autonomia Digital para Pessoas Idosas" com integração ao n8n para envio automático de mensagens WhatsApp.

## 🚀 Funcionalidades

- **Geração de rotas aleatórias** para acesso único às confirmações
- **Página de confirmação** responsiva com validação de dados
- **Integração com n8n** para envio automático de mensagens WhatsApp
- **Painel administrativo** para gerenciar confirmações
- **Importação de dados** do arquivo `table.json`
- **Banco PostgreSQL** para armazenamento seguro dos dados

## 📋 Pré-requisitos

- Node.js (versão 16 ou superior)
- PostgreSQL configurado
- Webhook do n8n configurado

## 🔧 Instalação

1. **Instalar dependências:**
```bash
npm install
```

2. **Configurar variáveis de ambiente:**
Copie o arquivo `.env.example` para `.env` e configure:
```env
PORT=3000
DATABASE_URL=postgresql://neondb_owner:npg_6mAswTBIYzS1@ep-quiet-violet-adwo4eho-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
N8N_WEBHOOK_URL=https://seu-n8n-webhook-url.com/webhook
```

3. **Executar a aplicação:**
```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

## 📱 Como usar

### Para Participantes
1. Acesse a URL gerada pelo administrador (ex: `http://localhost:3000/ABC123`)
2. Preencha o formulário com seus dados
3. Confirme sua participação
4. Receba a mensagem de confirmação via WhatsApp

### Para Administradores
1. Acesse o painel administrativo: `http://localhost:3000/admin`
2. Gere novas rotas de confirmação
3. Visualize estatísticas e confirmações
4. Importe dados do `table.json`
5. Reenvie webhooks quando necessário

## 🗄️ Estrutura do Banco de Dados

### Tabela `rotas`
- `id`: ID único da rota
- `codigo`: Código aleatório da rota
- `usado`: Se a rota foi acessada
- `criado_em`: Data de criação

### Tabela `confirmacoes`
- `id`: ID único da confirmação
- `codigo_rota`: Código da rota utilizada
- `nome`: Nome completo do participante
- `telefone`: Telefone/WhatsApp
- `email`: Email (opcional)
- `webhook_enviado`: Status do envio do webhook
- `data_confirmacao`: Data da confirmação

### Tabela `participantes_importados`
- Dados importados do `table.json`
- Campos correspondentes ao formulário original

## 🔗 Integração com n8n

O sistema envia dados para o webhook do n8n no formato:
```json
{
  "mensagem": "Mensagem formatada para WhatsApp",
  "telefone": "85999999999",
  "nome": "Nome do Participante",
  "email": "email@exemplo.com",
  "codigo": "ABC123"
}
```

## 📊 Endpoints da API

- `POST /api/gerar-rota` - Gera nova rota de confirmação
- `GET /:codigo` - Página de confirmação
- `POST /api/confirmar/:codigo` - Processa confirmação
- `GET /admin` - Painel administrativo
- `GET /api/confirmacoes` - Lista confirmações
- `POST /api/importar-dados` - Importa dados do table.json
- `POST /api/reenviar-webhook/:id` - Reenvia webhook

## 🎨 Interface

- **Design responsivo** compatível com dispositivos móveis
- **Validação em tempo real** dos formulários
- **Feedback visual** para ações do usuário
- **Painel administrativo** intuitivo

## 🔒 Segurança

- Validação de dados no servidor
- Códigos de rota únicos e aleatórios
- Conexão segura com PostgreSQL
- Tratamento de erros robusto

## 📝 Logs e Monitoramento

O sistema registra:
- Acessos às rotas de confirmação
- Confirmações realizadas
- Envios de webhook
- Erros de integração

## 🛠️ Desenvolvimento

Para contribuir com o projeto:

1. Clone o repositório
2. Instale as dependências
3. Configure o ambiente de desenvolvimento
4. Execute os testes
5. Faça suas alterações
6. Envie um pull request

## 📞 Suporte

Para dúvidas ou problemas:
- Verifique os logs da aplicação
- Consulte a documentação do n8n
- Entre em contato com a equipe da SIA

---

**Desenvolvido pela Secretaria de Inteligência Artificial (SIA)**