resource "digitalocean_droplet" "web" {
  image    = var.image
  name     = var.droplet_name
  region   = var.region
  size     = var.size
  ssh_keys = var.ssh_keys
  tags     = var.tags

  # Optional: Enable backups and IPv6
  backups = false
  ipv6    = false
}
