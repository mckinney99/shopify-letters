data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

data "aws_subnet" "public_a" {
  filter {
    name   = "tag:Name"
    values = ["modvent-public-a"]
  }
}

data "aws_subnet" "public_b" {
  filter {
    name   = "tag:Name"
    values = ["modvent-public-b"]
  }
}

data "aws_subnet" "private_a" {
  filter {
    name   = "tag:Name"
    values = ["modvent-private-a"]
  }
}

data "aws_subnet" "private_b" {
  filter {
    name   = "tag:Name"
    values = ["modvent-private-b"]
  }
}

locals {
  public_subnet_ids  = [data.aws_subnet.public_a.id, data.aws_subnet.public_b.id]
  private_subnet_ids = [data.aws_subnet.private_a.id, data.aws_subnet.private_b.id]
}
