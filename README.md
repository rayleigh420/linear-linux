# Linear Linux APT Repository

## Install

```bash
curl -fsSL https://rayleigh420.github.io/linear-linux/gpg.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/linear-linux.gpg

echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/linear-linux.gpg] \
  https://rayleigh420.github.io/linear-linux ./" \
  | sudo tee /etc/apt/sources.list.d/linear-linux.list

sudo apt update
sudo apt install linear-linux
```
