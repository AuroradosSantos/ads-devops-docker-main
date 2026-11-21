# Atividade N3 — API da Loja

## Requisitos

- Docker Desktop com Docker Compose e Kubernetes habilitado, ou um cluster de laboratório (por exemplo, Killercoda).
- `kubectl` configurado para apontar para o cluster desejado.
- Para usar o HPA, o cluster precisa ter Metrics Server.

## Docker Compose

Abra um terminal nesta pasta. Opcionalmente, copie `.env.example` para `.env` e ajuste as senhas:

```powershell
Copy-Item .env.example .env
```

Suba API, MySQL e Redis:

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/categorias
Invoke-RestMethod http://localhost:3000/produtos
```

A API usa Redis como cache por 60 segundos nas rotas de categorias e produtos. Se Redis estiver fora, as consultas seguem no MySQL; `/health` retorna `503` até ambas as dependências responderem. Para acompanhar ou encerrar:

```powershell
docker compose logs -f app
docker compose down
```

As tabelas e dados de demonstração são criados na primeira inicialização do volume MySQL a partir de `sql/01-tabelas.sql`. Para apagar os dados e recriar o banco do zero, use `docker compose down -v` (isso remove os volumes locais).

## Kubernetes

Os manifestos estão em `k8s/`. Antes de aplicar, personalize o namespace `n3-marcoandre` em todos os YAML para o nome exigido pelo professor. Ajuste também as senhas de demonstração em `k8s/01-secrets.yaml`; Secret do Kubernetes codifica valores, mas não substitui um cofre de segredos em produção.

Construa a imagem da API:

```powershell
docker build -t loja-api:1.0 .
```

No Docker Desktop com Kubernetes integrado, a imagem local geralmente pode ser usada diretamente. Em clusters remotos/Killercoda, publique a imagem em um registry acessível ao cluster e altere `image` em `k8s/04-app.yaml` para `USUARIO/loja-api:1.0` (ou o endereço do registry).

Aplique os recursos:

```powershell
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-secrets.yaml
kubectl apply -f k8s/02-mysql.yaml
kubectl apply -f k8s/03-redis.yaml
kubectl apply -f k8s/04-app.yaml
kubectl apply -f k8s/05-hpa.yaml
kubectl -n n3-marcoandre get pods,svc,hpa
```

Acesse a API no Docker Desktop em `http://localhost:30080/health`. Para encaminhar a porta em outro cluster, use `kubectl -n n3-marcoandre port-forward svc/loja-api 3000:3000` e acesse `http://localhost:3000/health`.

### Escalar, atualizar e observar

O Deployment começa com duas réplicas. Para escalar manualmente e acompanhar:

```powershell
kubectl -n n3-marcoandre scale deployment/loja-api --replicas=3
kubectl -n n3-marcoandre get deployment/loja-api -w
```

Para atualizar a imagem, construa/publique uma nova tag (por exemplo `loja-api:1.1`), altere a imagem no manifesto e aplique. Alternativamente:

```powershell
kubectl -n n3-marcoandre set image deployment/loja-api api=loja-api:1.1
kubectl -n n3-marcoandre rollout status deployment/loja-api
kubectl -n n3-marcoandre rollout undo deployment/loja-api
```

O HPA tenta manter o uso médio de CPU abaixo de 70%, entre 2 e 5 pods. Ele precisa de Metrics Server e de `resources.requests` definidos; em cluster sem métricas, HPA ficará sem conseguir calcular a escala. `kubectl top pods -n n3-marcoandre` ajuda a consultar as métricas.

## O que cada recurso faz

- `00-namespace.yaml`: cria o espaço isolado da atividade.
- `01-secrets.yaml`: guarda as senhas de exemplo usadas pelos containers.
- `02-mysql.yaml`: cria as tabelas/dados, volume persistente, Deployment e Service do MySQL.
- `03-redis.yaml`: cria o Deployment e Service do Redis.
- `04-app.yaml`: executa a API com probes, variáveis, limites de recursos e Service NodePort.
- `05-hpa.yaml`: escala automaticamente a API com base no uso de CPU.
- `docker-compose.yml`: inicia os três serviços localmente para desenvolvimento.

