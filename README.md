# Flying Takoyaki

`assets` 폴더의 이미지로 만든 Flappy Bird 스타일 미니게임입니다.

## 로컬 실행

정적 파일이라 바로 브라우저로 열어도 되지만, 로컬 서버 실행을 권장합니다.

```powershell
python -m http.server 5500
```

그 다음 브라우저에서 `http://localhost:5500` 접속.

조작:
- 클릭 또는 스페이스: 점프
- 장애물 통과: 점수 +1
- 충돌/바닥/천장 접촉: 게임 오버

## Azure 배포 (Terraform)

`infra` 폴더에 Azure Storage 정적 웹사이트 배포 Terraform이 포함되어 있습니다.

### 1) 사전 준비

- Terraform 설치
- Azure CLI 로그인: `az login`
- Subscription ID 확인: `az account show --query id -o tsv`

### 2) 배포

```powershell
cd .\infra
terraform init
terraform plan -var "subscription_id=<YOUR_SUBSCRIPTION_ID>"
terraform apply -var "subscription_id=<YOUR_SUBSCRIPTION_ID>"
```

배포 완료 후 `static_website_url` 출력값으로 접속하면 됩니다.
