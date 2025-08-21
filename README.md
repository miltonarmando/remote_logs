# 📊 LogsReader - Monitor em Tempo Real

Uma aplicação completa para monitoramento de arquivos `.log` em tempo real com interface web estilo bloco de notas e highlight de palavras.

## 🌟 Características Principais

### 📝 **Interface Estilo Bloco de Notas**
- **Aparência limpa** como um editor de texto simples
- **Fonte monoespaçada** (Courier New) para melhor legibilidade
- **Visualização pura** do texto dos logs sem decorações
- **Fundo branco** com scroll suave e responsivo

### ⭐ **Highlight de Palavras em Tempo Real** 
- **Campo de highlight** para destacar palavras-chave
- **Múltiplas palavras** separadas por vírgula
- **Destaque instantâneo** em amarelo brilhante
- **Busca case-insensitive** automática

### 📱 Interface Web Responsiva
- **Dashboard em tempo real** com atualizações via WebSocket
- **Filtros avançados** por nível de log, arquivo e busca textual
- **Estatísticas visuais** e contadores em tempo real
- **Auto-scroll** configurável para acompanhar novos logs
- **Exportação** de logs em formato JSON

### 🔌 API REST Completa
- `GET /api/logs` - Logs com paginação e filtros
- `GET /api/files` - Lista de arquivos monitorados
- `GET /api/stats` - Estatísticas detalhadas
- `GET /api/stream` - Stream em tempo real via Server-Sent Events (SSE)
- `GET /api/health` - Health check do servidor

### ⚡ Recursos Avançados
- **Monitoramento automático** de novos arquivos `.log`
- **WebSocket** para atualizações em tempo real
- **Server-Sent Events (SSE)** para streaming contínuo
- **Detecção automática** de níveis de log (Error, Warning, Info, Debug)
- **Hot-reload** quando arquivos são adicionados/removidos
- **Multi-arquivo** - monitora múltiplos logs simultaneamente

## 🚀 Como Usar

### 1. Instalar Dependências
```bash
npm install
```

### 2. Iniciar o Servidor
```bash
npm start
```

### 3. Acessar a Interface
- **Interface Web**: http://localhost:3000
- **API Base**: http://localhost:3000/api
- **Live Stream**: http://localhost:3000/api/stream

### 4. Adicionar Arquivos de Log
Coloque seus arquivos `.log` na pasta `./logs/` (será criada automaticamente)

## 🎯 **Como Usar o Highlight**

### **Funcionalidade Principal**
- **Campo de Entrada**: "✨ Destacar palavras (separadas por vírgula)..."
- **Múltiplas Palavras**: Digite palavras separadas por vírgula
- **Atualização Instantânea**: O highlight é aplicado em tempo real
- **Case Insensitive**: Não diferencia maiúsculas de minúsculas

### **Exemplos Práticos**
```
Entrada: "ERROR, failed, conexão"
Resultado: Todas essas palavras ficarão destacadas em amarelo

Entrada: "backup, admin, database, timeout"
Resultado: Destaque de múltiplas palavras simultaneamente

Entrada: "user@example.com"
Resultado: Emails específicos são destacados
```

### **Visual do Highlight**
- **Cor**: Fundo amarelo brilhante (#ffff00)
- **Texto**: Preto em negrito para contraste
- **Bordas**: Arredondadas para visual suave
- **Responsivo**: Funciona em tempo real conforme você digita

## 📁 Estrutura do Projeto

```
LogsReader/
├── server.js              # Servidor principal com WebSocket e API
├── package.json           # Dependências e scripts
├── public/
│   └── index.html         # Interface web moderna
├── logs/                  # Pasta para arquivos .log (auto-criada)
└── README.md             # Documentação
```

## 🎯 Exemplos de Uso da API

### Buscar Logs com Filtros
```bash
# Logs de erro das últimas 24h
curl "http://localhost:3000/api/logs?level=error&since=2025-08-19T00:00:00"

# Logs de um arquivo específico
curl "http://localhost:3000/api/logs?filename=app.log&limit=100"

# Busca por texto
curl "http://localhost:3000/api/logs?search=database&page=1"
```

### Stream em Tempo Real (SSE)
```javascript
const eventSource = new EventSource('http://localhost:3000/api/stream');
eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    console.log('Novo log:', data);
};
```

### WebSocket (JavaScript)
```javascript
const socket = io('http://localhost:3000');
socket.on('newLogEntry', (entry) => {
    console.log('Nova entrada:', entry);
});
```

## 🔧 Configuração

### Variáveis de Ambiente
```bash
PORT=3000                    # Porta do servidor
LOG_DIR=./logs              # Diretório dos logs
```

### Níveis de Log Detectados
- **Error**: Linhas contendo "error" ou "err"
- **Warning**: Linhas contendo "warn" ou "warning"  
- **Info**: Linhas contendo "info"
- **Debug**: Linhas contendo "debug"
- **Info** (default): Outras linhas

## 🎨 Interface Web

A interface web oferece:

### 📊 Dashboard Principal
- Contadores de arquivos, entradas e clientes conectados
- Status de conexão em tempo real
- Estatísticas por nível de log

### 🔍 Controles de Filtro
- Busca textual nos logs
- Filtro por nível de log
- Filtro por arquivo
- Botões para limpar e exportar

### 📜 Painel de Logs
- Exibição em tempo real com animações
- Cores diferentes por nível de log
- Auto-scroll configurável
- Meta-informações de cada entrada

### 📁 Sidebar Informativa
- Lista de arquivos monitorados
- Estatísticas por nível
- Endpoints da API disponíveis

## 🚀 Recursos Técnicos

### Backend (Node.js)
- **Express** para servidor HTTP e API REST
- **Socket.IO** para comunicação em tempo real
- **Chokidar** para monitoramento de arquivos
- **Tail** para leitura incremental de logs
- **CORS** habilitado para APIs externas

### Frontend (HTML5/CSS3/JavaScript)
- **WebSocket** para updates em tempo real
- **CSS Grid/Flexbox** para layout responsivo
- **CSS Animations** para transições suaves
- **Fetch API** para chamadas REST
- **Event Source** para SSE

### Funcionalidades Especiais
- **Hot-reload** de arquivos
- **Buffer circular** para performance (máx. 1000 entradas)
- **Graceful shutdown** com cleanup
- **Error handling** robusto
- **Memory management** otimizado

## 🎉 Demonstração

1. **Execute** o servidor
2. **Abra** http://localhost:3000
3. **Adicione** um arquivo `.log` na pasta `logs/`
4. **Veja** as atualizações em tempo real!

### Criar Log de Teste
```bash
# Windows PowerShell
echo "$(Get-Date) INFO Application started" >> logs/app.log
echo "$(Get-Date) ERROR Database connection failed" >> logs/app.log
echo "$(Get-Date) WARNING Low disk space" >> logs/app.log
```

## 🔄 Desenvolvimento

### Modo de Desenvolvimento
```bash
npm install -g nodemon
npm run dev
```

### Estrutura de Dados da API

#### Log Entry
```json
{
  "id": 1629555555555.123,
  "timestamp": "2025-08-20 14:30:45",
  "filename": "app.log",
  "content": "Database connection established",
  "level": "info",
  "size": 32
}
```

#### API Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1250,
    "pages": 25
  }
}
```

## 🎯 Próximos Passos

Esta aplicação está pronta para uso e pode ser facilmente estendida com:
- Alertas por email/Slack
- Banco de dados para persistência
- Autenticação de usuários
- Dashboards customizados
- Integração com ferramentas de monitoramento

---

**🌟 Desfrute do monitoramento de logs em tempo real!** 🚀


<div class="widget">
                    <h3>🌐 API Endpoints</h3>
                    <div style="font-size: 12px; line-height: 1.6;">
                        <strong>📊 Estatísticas:</strong><br>
                        <code>GET /api/stats</code><br><br>
                        
                        <strong>📜 Logs (JSON):</strong><br>
                        <code>GET /api/logs</code><br><br>
                        
                        <strong>📡 Stream (SSE):</strong><br>
                        <code>GET /api/stream</code><br><br>
                        
                        <strong>📁 Arquivos:</strong><br>
                        <code>GET /api/files</code>
                    </div>
                </div>