output "droplet_ip" {
  value       = digitalocean_droplet.web.ipv4_address
  description = "The public Ip address of the droplet"
}
